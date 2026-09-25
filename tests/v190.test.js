import { test } from "node:test";
import assert from "node:assert/strict";
import { filterReports, summarize } from "../src/discovery.js";
import { validateReport, validateEdit } from "../server/domain.js";

const now = 1700000000000;
const day = 24 * 3600 * 1000;
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
  expired: false,
  prediction: { minutes: 30 },
  ...over,
});

const validBody = () => ({
  category: "access",
  title: "Blocked ramp",
  location: "Market & 8th",
  description: "Scaffolding blocks the curb ramp",
  lat: 37.7749,
  lng: -122.4194,
  severity: 2,
  city: "sf",
});

test("stepFree is normalized to a boolean on create and edit", () => {
  assert.equal(validateReport(validBody()).stepFree, false);
  assert.equal(
    validateReport({ ...validBody(), stepFree: true }).stepFree,
    true,
  );
  // Truthy non-booleans don't leak through as stepFree.
  assert.equal(
    validateReport({ ...validBody(), stepFree: "yes" }).stepFree,
    false,
  );
  assert.equal(validateEdit({ stepFree: true }).stepFree, true);
  assert.equal(validateEdit({ stepFree: 0 }).stepFree, false);
});

test("stepFreeOnly filter keeps only step-free reports", () => {
  const rows = [
    row({ id: "sf", stepFree: true }),
    row({ id: "plain" }),
    row({ id: "falsy", stepFree: false }),
  ];
  assert.deepEqual(
    filterReports(rows, { ...base, stepFreeOnly: true }).map((r) => r.id),
    ["sf"],
  );
  assert.equal(filterReports(rows, { ...base }).length, 3);
});

test("summarize counts reports cleared in the last 7 days", () => {
  const rows = [
    row({ id: "fresh", status: "resolved", updatedAt: now - 2 * day }),
    row({ id: "old", status: "resolved", updatedAt: now - 10 * day }),
    row({ id: "edge", status: "resolved", updatedAt: now - 7 * day }),
    row({ id: "active", status: "active", updatedAt: now - day }),
  ];
  const stats = summarize(rows, now);
  assert.equal(stats.resolved, 3);
  assert.equal(stats.clearedWeek, 2);
});

test("summarize handles an empty list", () => {
  const stats = summarize([], now);
  assert.deepEqual(
    [stats.active, stats.major, stats.stale, stats.resolved, stats.clearedWeek],
    [0, 0, 0, 0, 0],
  );
});
