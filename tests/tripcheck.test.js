import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampWidth,
  corridorReports,
  pointToSegmentM,
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
