import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seattleToday,
  permitWindowIncludes,
  filterPermitWindows,
  permitWeekDays,
  searchPermitWindows,
} from "../src/permit-windows.js";

test("Seattle date uses Pacific time across UTC day boundary", () => {
  assert.equal(seattleToday(new Date("2026-10-02T04:00:00Z")), "2026-10-01");
  assert.equal(seattleToday(new Date("2026-10-02T18:00:00Z")), "2026-10-02");
});

test("permit window honors dates and published weekdays", () => {
  const sunday = { start: "2026-10-01", end: "2026-10-31", days: [0] };
  assert.equal(permitWindowIncludes(sunday, "2026-10-04"), true);
  assert.equal(permitWindowIncludes(sunday, "2026-10-05"), false);
  assert.equal(permitWindowIncludes(sunday, "2026-11-01"), false);
  assert.equal(
    permitWindowIncludes({ ...sunday, days: [] }, "2026-10-04"),
    false,
  );
});

test("today, seven-day, and all-window filters distinguish unknown schedules", () => {
  const sunday = {
    id: "sunday",
    start: "2026-10-01",
    end: "2026-10-31",
    days: [0],
  };
  const unknown = {
    id: "unknown",
    start: "2026-10-01",
    end: "2026-10-31",
    days: [],
  };
  const later = {
    id: "later",
    start: "2026-12-01",
    end: "2026-12-31",
    days: [0],
  };
  const events = [sunday, unknown, later];
  assert.deepEqual(filterPermitWindows(events, "today", "2026-10-02"), []);
  assert.deepEqual(filterPermitWindows(events, "week", "2026-10-02"), [sunday]);
  assert.deepEqual(filterPermitWindows(events, "all", "2026-10-02"), events);
  assert.deepEqual(filterPermitWindows(events, "2026-10-04", "2026-10-02"), [
    sunday,
  ]);
  assert.deepEqual(permitWeekDays("2026-10-02"), [
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
  ]);
});

test("permit search matches public project, street, type, or permit number", () => {
  const events = [
    { id: "P1", title: "Play Street", street: "Pine St", type: "Festival" },
    {
      id: "P2",
      title: "Utility work",
      street: "Broadway",
      type: "Construction",
    },
  ];
  assert.deepEqual(searchPermitWindows(events, "  PINE  "), [events[0]]);
  assert.deepEqual(searchPermitWindows(events, "construction"), [events[1]]);
  assert.deepEqual(searchPermitWindows(events, "p2"), [events[1]]);
  assert.deepEqual(searchPermitWindows(events, ""), events);
});
