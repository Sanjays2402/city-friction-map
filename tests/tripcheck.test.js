import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampWidth,
  corridorReports,
  pointToSegmentM,
  readTripLink,
  tripLink,
  tripSummary,
} from "../src/tripcheck.js";

const path = [
  { lat: 37.77, lng: -122.42 },
  { lat: 37.78, lng: -122.42 },
];
const near = {
  id: "near",
  status: "active",
  lat: 37.775,
  lng: -122.419,
  hidden: false,
};
const far = {
  id: "far",
  status: "active",
  lat: 37.775,
  lng: -122.416,
  hidden: false,
};

test("point to segment distance is near zero on the line", () => {
  assert.ok(pointToSegmentM({ lat: 37.775, lng: -122.42 }, ...path) < 1);
  // About 0.001 degrees of longitude ~ 88 meters at this latitude.
  const off = pointToSegmentM(near, ...path);
  assert.ok(off > 50 && off < 150, `expected ~88m, got ${off}`);
});

test("corridorReports finds reports within the width", () => {
  const hits = corridorReports([near, far], path, 100);
  assert.deepEqual(
    hits.map((r) => r.id),
    ["near"],
  );
  assert.ok(hits[0].corridorM > 50 && hits[0].corridorM < 150);
  const wide = corridorReports([near, far], path, 500);
  assert.deepEqual(
    wide.map((r) => r.id),
    ["near", "far"],
  );
  assert.ok(wide[0].corridorM <= wide[1].corridorM);
});

test("corridorReports skips resolved, hidden, and bad input", () => {
  assert.deepEqual(
    corridorReports([near], [{ lat: 37.77, lng: -122.42 }], 500),
    [],
  );
  assert.deepEqual(corridorReports([near], [], 500), []);
  assert.deepEqual(
    corridorReports(
      [
        { ...near, id: "resolved", status: "resolved" },
        { ...near, id: "hidden", hidden: true },
        { ...near, id: "expired", expired: true },
        { ...near, id: "nolat", lat: NaN },
      ],
      path,
      500,
    ),
    [],
  );
});

test("corridor width is clamped to a sane range", () => {
  assert.equal(clampWidth(250), 250);
  assert.equal(clampWidth(10), 50);
  assert.equal(clampWidth(99999), 2000);
  assert.equal(clampWidth("banana"), 250);
  assert.equal(clampWidth(undefined), 250);
});

test("trip summary separates major, step-free and labeled demo reports", () => {
  assert.deepEqual(
    tripSummary([
      { severity: 3, stepFree: true, demo: true },
      { severity: 2, stepFree: false, demo: false },
    ]),
    { total: 2, major: 1, stepFree: 1, demo: 1 },
  );
});

test("trip links round-trip route geometry and width without report data", () => {
  const link = tripLink("https://example.test/?preview=phone", "sf", path, 350);
  assert.equal(
    link,
    "https://example.test/?city=sf&route=37.77000%2C-122.42000%3B37.78000%2C-122.42000&width=350",
  );
  assert.deepEqual(readTripLink(new URL(link).search, "sf"), {
    path,
    widthM: 350,
  });
  assert.equal(readTripLink(new URL(link).search, "sea"), null);
});

test("trip links reject malformed, oversized and out-of-range routes", () => {
  assert.equal(tripLink("https://example.test", "sf", [path[0]], 250), null);
  assert.equal(
    tripLink(
      "https://example.test",
      "sf",
      [{ lat: NaN, lng: 0 }, path[1]],
      250,
    ),
    null,
  );
  for (const route of [
    "37.7,-122.4",
    "37.7,-122.4;91,-122.4",
    "37.7,-122.4;bad,-122.4",
    "37.7,-122.4;37.8,-122.4;".repeat(31),
  ]) {
    const search = new URLSearchParams({ city: "sf", route, width: "250" });
    assert.equal(readTripLink(search.toString(), "sf"), null);
  }
  assert.equal(
    readTripLink("?city=sf&route=37.7,-122.4;37.8,-122.4&width=99999", "sf"),
    null,
  );
});
