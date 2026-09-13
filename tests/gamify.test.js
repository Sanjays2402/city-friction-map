import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import {
  XP,
  LEVELS,
  WEEKLY_GOAL,
  computeProfile,
  levelFor,
  xpForStats,
} from "../server/gamify.js";

const ALICE = "alice-visitor-0001";
const BOB = "bob-visitor-000002";
const CAROL = "carol-visitor-0003";
const DAVE = "dave-visitor-00004";

function report(lat, lng, title = "Sidewalk blocked by work") {
  return {
    category: "access",
    title,
    location: "Market St test block",
    description: "test report",
    lat,
    lng,
    severity: 2,
  };
}

function seeded() {
  const store = createStore(":memory:", false);
  // Bob files two reports far apart; alice confirms one and notes on it.
  const b1 = store.create(report(37.77, -122.42, "Blocked sidewalk one"), BOB);
  const b2 = store.create(report(37.79, -122.4, "Blocked sidewalk two"), BOB);
  const a1 = store.create(report(37.76, -122.43, "Noise all night"), ALICE);
  store.vote(b1.report.id, ALICE, "confirm");
  const note = store.addComment(b1.report.id, ALICE, { body: "Still there" });
  store.toggleReaction(note.id, CAROL); // helpful received by alice
  store.toggleReaction(note.id, DAVE); // second helpful received
  return { store, b1: b1.report.id, b2: b2.report.id, a1: a1.report.id, note };
}

test("levelFor maps XP to levels with progress", () => {
  assert.deepEqual(levelFor(0), {
    name: "Newcomer",
    icon: "🌱",
    min: 0,
    next: { name: "Regular", icon: "🧭", min: 50 },
    progress: 0,
  });
  const mid = levelFor(75);
  assert.equal(mid.name, "Regular");
  assert.equal(mid.progress, 0.25);
  const top = levelFor(9999);
  assert.equal(top.name, "Legend");
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
  assert.deepEqual(
    LEVELS.map((l) => [l.min, l.name]),
    [
      [0, "Newcomer"],
      [50, "Regular"],
      [150, "Helper"],
      [300, "Guardian"],
      [600, "Legend"],
    ],
  );
});

test("computeProfile awards XP and excludes the automatic self-confirm", () => {
  const { store } = seeded();
  const p = computeProfile(store, ALICE);
  // 1 report (10) + 1 earned confirm (3) + 1 note (5) + 2 helpful (4) = 22.
  // The auto-confirm on alice's own report must not count.
  assert.equal(p.xp, 22);
  assert.equal(p.level.name, "Newcomer");
  assert.deepEqual(p.counts, {
    reports: 1,
    confirms: 1,
    clears: 0,
    notes: 1,
    helpfulReceived: 2,
    validatedFlags: 0,
    kudosReceived: 0,
  });
  assert.equal(XP.report, 10);
});

test("thanks received earn XP and show in counts", () => {
  const { store, b1 } = seeded();
  store.toggleKudos(b1, ALICE);
  store.toggleKudos(b1, CAROL);
  const p = computeProfile(store, BOB);
  assert.equal(p.counts.kudosReceived, 2);
  assert.equal(p.xp, 2 * XP.report + 2 * XP.kudos);
  // Un-thanking removes the XP again.
  store.toggleKudos(b1, ALICE);
  const q = computeProfile(store, BOB);
  assert.equal(q.counts.kudosReceived, 1);
  assert.equal(q.xp, 2 * XP.report + XP.kudos);
});

test("validated flags earn XP once a report is hidden", () => {
  const { store, b1 } = seeded();
  // Three distinct flags hide the report (HIDE_AFTER_FLAGS = 3).
  store.flag(b1, ALICE, "spam");
  store.flag(b1, CAROL, "spam");
  store.flag(b1, DAVE, "spam");
  const p = computeProfile(store, ALICE);
  assert.equal(p.counts.validatedFlags, 1);
  assert.equal(p.xp, 22 + XP.validatedFlag);
  assert.ok(p.badges.find((b) => b.id === "debunker").earned);
});

test("streak counts consecutive UTC days with contributions", () => {
  const { store } = seeded();
  const p = computeProfile(store, ALICE);
  assert.equal(p.streakDays, 1);
  const fresh = computeProfile(store, "nobody-visitor-9999");
  assert.equal(fresh.streakDays, 0);
  assert.equal(fresh.xp, 0);
  assert.ok(fresh.badges.every((b) => !b.earned));
});

test("weekly challenge tracks confirmations since Monday UTC", () => {
  const { store } = seeded();
  const p = computeProfile(store, ALICE);
  assert.equal(p.weeklyChallenge.goal, WEEKLY_GOAL);
  assert.equal(p.weeklyChallenge.progress, 1);
  assert.equal(p.weeklyChallenge.complete, false);
  assert.match(p.weeklyChallenge.label, /Confirm 4 more reports this week/);
});

test("badges unlock from real activity", () => {
  const { store } = seeded();
  const p = computeProfile(store, ALICE);
  const earned = Object.fromEntries(p.badges.map((b) => [b.id, b.earned]));
  assert.equal(earned.scout, true);
  assert.equal(earned.cartographer, false);
  assert.equal(earned.factchecker, false);
  assert.equal(earned.onaroll, false);
  assert.equal(earned.wiseneighbor, false);
  assert.equal(p.badges.length, 8);
});

test("explorer badge needs five distinct grid cells", () => {
  const store = createStore(":memory:", false);
  const cells = [
    [37.7, -122.5],
    [37.72, -122.47],
    [37.74, -122.44],
    [37.76, -122.41],
    [37.78, -122.38],
  ];
  cells.forEach(([lat, lng], i) =>
    store.create(report(lat, lng, `Report number ${i + 10}`), ALICE),
  );
  const p = computeProfile(store, ALICE);
  assert.ok(p.badges.find((b) => b.id === "explorer").earned);
  assert.ok(p.badges.find((b) => b.id === "cartographer").earned === false);
  assert.equal(p.xp, 5 * XP.report);
});

test("xpForStats matches the profile arithmetic for leaderboard rows", () => {
  assert.equal(
    xpForStats({ reports: 2, confirms: 4, notes: 1, helpful: 3, flags: 1 }),
    2 * 10 + (4 - 2) * 3 + 1 * 5 + 3 * 2 + 1 * 4,
  );
});

test("contributors rows carry level name and icon", () => {
  const { store } = seeded();
  const leaders = store.contributors();
  const bob = leaders.find((l) => l.reports === 2);
  assert.ok(bob);
  // Bob: 2 reports -> 20 XP -> Newcomer.
  assert.equal(bob.levelName, "Newcomer");
  assert.equal(bob.levelIcon, "🌱");
});
