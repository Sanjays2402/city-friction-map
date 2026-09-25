import { test } from "node:test";
import assert from "node:assert/strict";
import { filterReports } from "../src/discovery.js";
import { forwardSummary } from "../src/forward.js";
import { setLang } from "../src/i18n.js";

const now = 1700000000000;
const base = {
  status: "active",
  category: "all",
  query: "",
  sort: "recent",
  now,
};
const row = (over = {}) => ({
  id: "a",
  status: "active",
  category: "queue",
  title: "Long queue",
  location: "Market St",
  description: "Wraps around the block",
  lat: 37.77,
  lng: -122.42,
  severity: 2,
  confirmations: 3,
  clearVotes: 0,
  updatedAt: now - 1000,
  ...over,
});

test("nearby sort orders by distance and falls back without a location", () => {
  const rows = [
    row({ id: "far", lat: 37.8, lng: -122.42 }),
    row({ id: "near", lat: 37.7701, lng: -122.42 }),
  ];
  const userLoc = { lat: 37.77, lng: -122.42 };
  assert.deepEqual(
    filterReports(rows, { ...base, sort: "nearby", userLoc }).map((r) => r.id),
    ["near", "far"],
  );
  // No location: falls back to recency instead of crashing.
  assert.deepEqual(
    filterReports(rows, { ...base, sort: "nearby" }).map((r) => r.id),
    ["far", "near"],
  );
});

test("bounds filter keeps the exact edges and ignores missing bounds", () => {
  const bounds = { south: 37.7, north: 37.8, west: -122.5, east: -122.4 };
  const rows = [
    row({ id: "edge", lat: 37.7, lng: -122.4 }),
    row({ id: "out", lat: 37.9, lng: -122.42 }),
  ];
  assert.deepEqual(
    filterReports(rows, { ...base, bounds }).map((r) => r.id),
    ["edge"],
  );
  assert.equal(filterReports(rows, { ...base }).length, 2);
});

test("maxAgeHours treats 0 and undefined as no filter", () => {
  const rows = [row({ id: "old", updatedAt: now - 86400000 })];
  assert.equal(filterReports(rows, { ...base, maxAgeHours: 0 }).length, 1);
  assert.equal(filterReports(rows, { ...base }).length, 1);
  assert.equal(filterReports(rows, { ...base, maxAgeHours: 1 }).length, 0);
});

test("forwardSummary builds a complete 311 summary in English", () => {
  setLang("en");
  const text = forwardSummary(
    row({ confirmations: 5, clearVotes: 1, photo: "data:image/x" }),
    "https://example.test/r/abc",
  );
  assert.match(text, /Issue: Long queue/);
  assert.match(text, /Category: Long queues/);
  assert.match(text, /Location: Market St \(37\.77000, -122\.42000\)/);
  assert.match(text, /Details: Wraps around the block/);
  assert.match(text, /5 neighbors confirm.*1 say it is cleared/);
  assert.match(text, /Photo evidence attached/);
  assert.match(text, /Original report: https:\/\/example\.test\/r\/abc/);
});

test("forwardSummary skips the photo line without a photo and speaks Spanish", () => {
  setLang("es");
  try {
    const text = forwardSummary(
      row({ photo: null }),
      "https://example.test/r/x",
    );
    assert.match(text, /Problema: Long queue/);
    assert.match(text, /Ubicación: Market St/);
    assert.match(text, /3 vecinos confirman/);
    assert.doesNotMatch(text, /Foto de evidencia/);
    assert.match(text, /Reporte original: https:\/\/example\.test\/r\/x/);
  } finally {
    setLang("en");
  }
});
