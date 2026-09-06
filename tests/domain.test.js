import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distance,
  findDuplicate,
  prediction,
  validateReport,
} from "../server/domain.js";
import { createStore } from "../server/store.js";
const report = {
  category: "queue",
  title: "Long coffee queue",
  location: "Market Street",
  description: "",
  lat: 37.77,
  lng: -122.42,
  severity: 2,
};
test("distance is measured in meters", () => {
  assert.equal(distance(report, report), 0);
  assert.ok(distance(report, { ...report, lat: 37.771 }) > 110);
});
test("duplicates require category, proximity, recency, and active status", () => {
  const r = { ...report, status: "active", updatedAt: Date.now() };
  assert.equal(findDuplicate([r], report), r);
  for (const change of [
    { category: "noise" },
    { lat: 37.78 },
    { status: "resolved" },
    { updatedAt: 0 },
  ])
    assert.equal(findDuplicate([{ ...r, ...change }], report), undefined);
});
test("invalid coordinates and unrecognized categories are rejected", () => {
  for (const change of [
    { lat: NaN },
    { lng: 0 },
    { category: "__proto__" },
    { severity: 4 },
    { title: "x" },
  ])
    assert.throws(() => validateReport({ ...report, ...change }));
});
test("stale predictions remain unknown rather than resolved", () => {
  assert.equal(prediction({ ...report, updatedAt: 0 }).minutes, null);
  assert.equal(
    prediction({ ...report, updatedAt: Date.now(), confirmations: 10 })
      .confidence,
    "Medium",
  );
});
test("store merges duplicates and prevents repeated browser votes", () => {
  const s = createStore(":memory:", false);
  try {
    const a = s.create(report, "visitor-one");
    assert.equal(a.merged, false);
    const b = s.create(report, "visitor-two");
    assert.equal(b.merged, true);
    assert.equal(b.report.id, a.report.id);
    assert.equal(s.list().length, 1);
    assert.equal(b.report.confirmations, 2);
    assert.throws(() => s.vote(a.report.id, "visitor-two", "confirm"));
  } finally {
    s.close();
  }
});
test("two distinct clearance votes resolve a report", () => {
  const s = createStore(":memory:", false);
  try {
    const { report: r } = s.create(report, "reporter");
    assert.equal(s.vote(r.id, "one", "clear").status, "active");
    assert.throws(() => s.vote(r.id, "one", "clear"));
    assert.equal(s.vote(r.id, "two", "clear").status, "resolved");
    assert.throws(() => s.vote(r.id, "three", "confirm"));
  } finally {
    s.close();
  }
});
