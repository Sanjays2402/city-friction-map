import test from "node:test";
import assert from "node:assert/strict";
import { areaBrief, areaViewUrl, readAreaView } from "../src/area-brief.js";

const bounds = { south: 37.7, north: 37.8, west: -122.5, east: -122.4 };
const now = 1_800_000_000_000;
const report = (overrides = {}) => ({
  status: "active",
  expired: false,
  hidden: false,
  demo: false,
  lat: 37.75,
  lng: -122.45,
  category: "queue",
  severity: 2,
  stepFree: false,
  updatedAt: now - 3600000,
  ...overrides,
});

test("area brief counts only live reports inside inclusive map bounds", () => {
  const result = areaBrief(
    [
      report({ lat: bounds.south, lng: bounds.west, severity: 3 }),
      report({ category: "access", stepFree: true, demo: true }),
      report({
        lat: bounds.north,
        lng: bounds.east,
        updatedAt: now - 25 * 3600000,
      }),
      report({ lat: 37.9 }),
      report({ status: "resolved" }),
      report({ expired: true }),
      report({ hidden: true }),
    ],
    bounds,
    { now },
  );
  assert.deepEqual(result, {
    total: 3,
    major: 1,
    stepFree: 1,
    recent: 2,
    demo: 1,
    categories: [
      { id: "queue", count: 2 },
      { id: "access", count: 1 },
    ],
  });
  assert.equal(
    areaBrief([report({ demo: true })], bounds, { hideDemo: true }).total,
    0,
  );
});

test("area brief sorts tied categories and never treats future updates as recent", () => {
  const result = areaBrief(
    [
      report({ category: "noise", updatedAt: now + 1 }),
      report({ category: "access" }),
    ],
    bounds,
    { now },
  );
  assert.deepEqual(result.categories, [
    { id: "access", count: 1 },
    { id: "noise", count: 1 },
  ]);
  assert.equal(result.recent, 1);
});

test("area links restore the matching city camera and reject malformed values", () => {
  const link = areaViewUrl(
    "https://example.test/?preview=phone",
    "sea",
    {
      lat: 47.60621,
      lng: -122.33207,
    },
    14,
  );
  assert.equal(
    link,
    "https://example.test/?city=sea&lat=47.60621&lng=-122.33207&zoom=14",
  );
  assert.deepEqual(readAreaView(new URL(link).search, "sea"), {
    center: [47.60621, -122.33207],
    zoom: 14,
  });
  assert.equal(
    readAreaView("?city=sea&lat=47.6&lng=-122.3&zoom=19", "sea").zoom,
    19,
  );
  for (const search of [
    "?city=sf&lat=47.6&lng=-122.3&zoom=14",
    "?city=sea&lat=NaN&lng=-122.3&zoom=14",
    "?city=sea&lat=47.6&lng=-122.3&zoom=99",
    "?city=sea&lat=47.6&lng=-122.3",
  ])
    assert.equal(readAreaView(search, "sea"), null);
});
