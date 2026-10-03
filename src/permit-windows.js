const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function seattleToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(isoDate, count) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function permitWindowIncludes(event, isoDate) {
  if (
    !DATE_RE.test(isoDate) ||
    !DATE_RE.test(event?.start) ||
    !DATE_RE.test(event?.end)
  )
    return false;
  if (isoDate < event.start || isoDate > event.end) return false;
  // Missing weekday metadata is unknown, not an assertion that a permit
  // applies every day. Such records remain visible in "All windows".
  if (!Array.isArray(event.days) || !event.days.length) return false;
  const weekday = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return event.days.includes(weekday);
}

export function filterPermitWindows(events, mode, today) {
  if (!Array.isArray(events)) return [];
  if (mode === "all") return events;
  const dates =
    mode === "today"
      ? [today]
      : Array.from({ length: 7 }, (_, index) => addDays(today, index));
  return events.filter((event) =>
    dates.some((date) => permitWindowIncludes(event, date)),
  );
}
