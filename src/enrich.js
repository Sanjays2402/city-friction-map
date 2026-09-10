// Pure client helpers for the live-data map layers. No DOM or Leaflet here,
// so this module is importable from node --test.
const WMO_LABELS = new Map([
  [0, "clear"],
  [1, "mostly clear"],
  [2, "partly cloudy"],
  [3, "overcast"],
  [45, "fog"],
  [48, "icy fog"],
  [51, "light drizzle"],
  [53, "drizzle"],
  [55, "heavy drizzle"],
  [56, "freezing drizzle"],
  [57, "freezing drizzle"],
  [61, "light rain"],
  [63, "rain"],
  [65, "heavy rain"],
  [66, "freezing rain"],
  [67, "freezing rain"],
  [71, "light snow"],
  [73, "snow"],
  [75, "heavy snow"],
  [77, "snow grains"],
  [80, "light showers"],
  [81, "showers"],
  [82, "violent showers"],
  [85, "snow showers"],
  [86, "snow showers"],
  [95, "thunderstorm"],
  [96, "storm, hail"],
  [99, "storm, hail"],
]);

// WMO weather code -> short human label for the weather pill.
export function weatherLabel(code) {
  return WMO_LABELS.get(Number(code)) || "—";
}

// Bay Wheels station -> marker color by open-dock availability.
export function dockColor(station) {
  const docks = Number(station?.docks) || 0;
  if (docks <= 0) return "#c0392b";
  if (docks <= 4) return "#d4a017";
  return "#2e7d32";
}

// 311 case status -> marker color. Open work orders stand out; closed fade.
export function caseColor(status) {
  return /open/i.test(status || "") ? "#c26a1b" : "#8a967d";
}

// NWS alert severity -> outline color for the alert layer.
export function alertColor(severity) {
  const s = (severity || "").toLowerCase();
  if (s.includes("extreme")) return "#a02020";
  if (s.includes("severe")) return "#c0392b";
  if (s.includes("moderate")) return "#d4a017";
  return "#3979a0";
}

// 311 case type -> the closest friction category for one-click reports.
export function caseCategory(type) {
  const t = (type || "").toLowerCase();
  if (/noise|music|loud|amplified/.test(t)) return "noise";
  if (/bike|bicycle/.test(t)) return "bikes";
  if (/restroom|toilet|pit stop/.test(t)) return "restroom";
  if (/signal|cell|internet|wifi/.test(t)) return "signal";
  if (/queue|line|wait/.test(t)) return "queue";
  return "access";
}
