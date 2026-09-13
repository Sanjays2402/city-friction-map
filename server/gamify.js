// Gamification is pure computation over existing data — no new tables.
// XP, levels, badges, streaks, and the weekly challenge are all derived from
// reports, votes, comments, reactions, and flags keyed by X-Visitor-Id.
export const XP = {
  report: 10,
  confirm: 3,
  note: 5,
  helpful: 2,
  validatedFlag: 4,
  kudos: 1,
};

export const LEVELS = [
  { min: 0, name: "Newcomer", icon: "🌱" },
  { min: 50, name: "Regular", icon: "🧭" },
  { min: 150, name: "Helper", icon: "🤝" },
  { min: 300, name: "Guardian", icon: "🛡️" },
  { min: 600, name: "Legend", icon: "🌟" },
];

export const WEEKLY_GOAL = 5;

export function levelFor(xp) {
  let current = LEVELS[0];
  for (const level of LEVELS) if (xp >= level.min) current = level;
  const next = LEVELS[LEVELS.indexOf(current) + 1] || null;
  const progress = next
    ? Math.min(1, (xp - current.min) / (next.min - current.min))
    : 1;
  return {
    name: current.name,
    icon: current.icon,
    min: current.min,
    next: next ? { name: next.name, icon: next.icon, min: next.min } : null,
    progress: Math.round(progress * 100) / 100,
  };
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const isNight = (t) => {
  const h = new Date(t).getUTCHours();
  return h >= 21 || h < 5;
};
const gridCell = (lat, lng) =>
  `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;

function mondayUtc(now = Date.now()) {
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
}

function streakDays(timestamps, now = Date.now()) {
  const days = new Set(
    timestamps.filter((t) => Number.isFinite(t)).map(dayKey),
  );
  if (!days.size) return 0;
  let cursor = new Date(now);
  // A streak is alive if the visitor contributed today or yesterday.
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor = new Date(cursor.getTime() - 86400000);
    if (!days.has(dayKey(cursor.getTime()))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return streak;
}

// The store supplies raw per-visitor activity; everything else is arithmetic.
export function computeProfile(store, visitorId, now = Date.now()) {
  const reports = store.reportsBy(visitorId);
  const votes = store.votesBy(visitorId);
  const notes = store.notesBy(visitorId);
  const flags = store.flagsBy(visitorId);
  const hiddenIds = new Set(store.hiddenReportIds());

  // The creator's own "confirm" vote is automatic, not earned.
  const createdIds = new Set(reports.map((r) => r.id));
  const confirms = votes.filter(
    (v) => v.action === "confirm" && !createdIds.has(v.reportId),
  );
  const clears = votes.filter((v) => v.action === "clear").length;
  const helpfulReceived = notes.reduce(
    (sum, n) => sum + (Number(n.helpful) || 0),
    0,
  );
  const validatedFlags = flags.filter((f) => hiddenIds.has(f.reportId)).length;
  const kudosReceived = store.kudosReceivedBy
    ? store.kudosReceivedBy(visitorId)
    : 0;

  const xp =
    reports.length * XP.report +
    confirms.length * XP.confirm +
    notes.length * XP.note +
    helpfulReceived * XP.helpful +
    validatedFlags * XP.validatedFlag +
    kudosReceived * XP.kudos;
  const level = levelFor(xp);

  const contributions = [
    ...reports.map((r) => r.createdAt),
    ...notes.map((n) => n.createdAt),
    ...confirms.map((v) => v.createdAt).filter((t) => t != null),
  ];
  const streak = streakDays(contributions, now);

  const weekStart = mondayUtc(now);
  const weeklyProgress = confirms.filter(
    (v) => v.createdAt != null && v.createdAt >= weekStart,
  ).length;
  const weeklyComplete = weeklyProgress >= WEEKLY_GOAL;

  const cells = new Set(reports.map((r) => gridCell(r.lat, r.lng)));
  const nightOwl = contributions.some(isNight);
  const wiseNote = notes.some((n) => (Number(n.helpful) || 0) >= 10);

  const badge = (id, name, icon, desc, earned) => ({
    id,
    name,
    icon,
    desc,
    earned: !!earned,
  });
  const badges = [
    badge(
      "scout",
      "Scout",
      "🔭",
      "Filed your first friction report",
      reports.length >= 1,
    ),
    badge(
      "cartographer",
      "Cartographer",
      "🗺️",
      "Filed 10 reports",
      reports.length >= 10,
    ),
    badge(
      "factchecker",
      "Fact-checker",
      "🔍",
      "Confirmed 25 reports",
      confirms.length >= 25,
    ),
    badge(
      "onaroll",
      "On a roll",
      "🔥",
      "Contributed 5 days in a row",
      streak >= 5,
    ),
    badge(
      "wiseneighbor",
      "Wise neighbor",
      "🦉",
      "A note earned 10+ helpful votes",
      wiseNote,
    ),
    badge(
      "debunker",
      "Debunker",
      "🕵️",
      "Flagged a report that was hidden",
      validatedFlags >= 1,
    ),
    badge(
      "explorer",
      "Explorer",
      "🧭",
      "Reported in 5 distinct areas",
      cells.size >= 5,
    ),
    badge(
      "nightowl",
      "Night owl",
      "🌙",
      "Contributed between 9pm and 5am",
      nightOwl,
    ),
  ];

  return {
    xp,
    level,
    badges,
    streakDays: streak,
    weeklyChallenge: {
      goal: WEEKLY_GOAL,
      progress: Math.min(weeklyProgress, WEEKLY_GOAL),
      complete: weeklyComplete,
      label: weeklyComplete
        ? "Weekly challenge complete — nice work!"
        : `Confirm ${WEEKLY_GOAL - weeklyProgress} more report${WEEKLY_GOAL - weeklyProgress === 1 ? "" : "s"} this week`,
    },
    counts: {
      reports: reports.length,
      confirms: confirms.length,
      clears,
      notes: notes.length,
      helpfulReceived,
      validatedFlags,
      kudosReceived,
    },
  };
}

// XP for a leaderboard row, from the same table as computeProfile.
export function xpForStats({ reports, confirms, notes, helpful, flags }) {
  return (
    reports * XP.report +
    Math.max(0, confirms - reports) * XP.confirm +
    notes * XP.note +
    helpful * XP.helpful +
    flags * XP.validatedFlag
  );
}
