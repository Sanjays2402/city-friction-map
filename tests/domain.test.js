import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anonymize,
  distance,
  findDuplicate,
  prediction,
  validateComment,
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
test("photo URLs are optional but must be valid http(s) links", () => {
  assert.equal(
    validateReport({ ...report, photoUrl: "https://example.com/a.jpg" })
      .photoUrl,
    "https://example.com/a.jpg",
  );
  assert.equal(validateReport({ ...report, photoUrl: "" }).photoUrl, "");
  assert.equal(validateReport(report).photoUrl, "");
  for (const photoUrl of [
    "ftp://example.com/a.jpg",
    "not a url",
    "https://" + "a".repeat(500),
    42,
  ])
    assert.throws(() => validateReport({ ...report, photoUrl }), /photo/i);
});
test("comments need 1 to 300 characters and authors stay anonymous", () => {
  assert.equal(validateComment({ body: "  still here  " }), "still here");
  for (const body of ["", "   ", "x".repeat(301), {}, null, 42])
    assert.throws(() => validateComment({ body }));
  assert.match(anonymize("visitor-abc-123"), /^Neighbor [a-zA-Z0-9]{1,6}$/);
  assert.ok(!anonymize("visitor-abc-123").includes("visitor-abc-123"));
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
