import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { categories } from "../server/domain.js";
import { publicCities } from "../server/cities.js";
import { SUPPORTED_LANGS, t, setLang, currentLang } from "./i18n.js";
import { initTheme, toggleTheme, DARK } from "./darkmode.js";
import { initNotifications } from "./notify-ui.js";
import { resolveCity, readStoredCity, initCitySwitcher } from "./cities-ui.js";
import {
  queueReport,
  pendingCount,
  syncPending,
  onOnline,
  isOnline,
} from "./offline.js";
import { corridorReports, clampWidth } from "./tripcheck.js";
import { toGeoJSON, parseImport, validateImportFeature } from "./geojson.js";
import { isTypingTarget, shortcutFor } from "./shortcuts.js";
import {
  weatherLabel,
  dockColor,
  caseColor,
  alertColor,
  caseCategory,
} from "./enrich.js";

// leaflet.heat attaches itself to the global Leaflet object, so expose the
// bundled copy, then preload the plugin. The toggle awaits it before drawing.
window.L = L;
const heatReady = import("leaflet.heat");
import {
  detectUpdates,
  filterReports,
  readFollowed,
  readIdSet,
  readSaved,
  readSnapshot,
  snapshotReports,
  summarize,
  toCSV,
  writeIdSet,
  writeSnapshot,
} from "./discovery.js";
const $ = (s) => document.querySelector(s),
  escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let visitor = localStorage.getItem("friction-visitor");
if (!visitor) {
  visitor = crypto.randomUUID();
  localStorage.setItem("friction-visitor", visitor);
}
initTheme();
// Multi-city: resolve the city synchronously from the bundled registry so
// the map has a center before /api/cities answers; loadCities() below
// refreshes the list from the server and mounts the switcher.
let cities = publicCities();
let city = resolveCity(cities, readStoredCity(localStorage));
// Embeddable map: /embed?city=sea renders the same app with a slim chrome
// (body.embed hides everything but the map) for iframe embeds.
const embedMode = location.pathname === "/embed";
if (embedMode) {
  const embedCity = new URL(location.href).searchParams.get("city");
  if (embedCity) city = resolveCity(cities, embedCity);
  document.body.classList.add("embed");
}
let reports = [],
  category = "all",
  query = "",
  selected = null,
  status = "active",
  lastUpdated = null;
const saved = readSaved(localStorage);
const followed = readFollowed(localStorage);
const unseen = readIdSet(localStorage, "friction-unseen");
let seen = readSnapshot(localStorage);
let majorOnly = false,
  hideDemo = false,
  savedOnly = false,
  followedOnly = false,
  sort = "recent";
const deepLink = location.pathname.match(/^\/r\/([A-Za-z0-9-]+)/);
let initialReport = deepLink
  ? deepLink[1]
  : new URL(location.href).searchParams.get("report");
let lastDetailKey = null,
  commentsFor = null;
$("#app").innerHTML = `
<header><a class="brand" href="/" aria-label="${t("header.brandAria")}"><span class="brand-icon">↗</span> city<span>friction</span><sup id="brand-city">${escape(city.short)}</sup></a><nav><span class="nav-active">${t("header.navExplore")}</span><button id="about">${t("header.about")} ↗</button></nav><span id="city-slot"></span><span id="notify-slot"></span><select id="lang-select" aria-label="Language">${SUPPORTED_LANGS.map((l) => `<option value="${l.id}"${l.id === currentLang() ? " selected" : ""}>${l.label}</option>`).join("")}</select><button id="theme-toggle" class="icon-button" aria-label="Toggle dark mode">🌙</button><span id="offline-pill" class="offline-pill" hidden></span><button id="you-chip" class="you-chip" hidden aria-label="${t("header.profileAria")}"><span id="you-icon">🌱</span><span id="you-name">${t("header.newcomer")}</span><span class="xp-track"><span id="you-xp" class="xp-fill"></span></span></button><button class="primary" id="report">＋ ${t("header.report")}</button></header>
<main><section class="intro"><div><div class="eyebrow">${t("hero.eyebrow")}</div><h1>${t("hero.titleA")}<br class="mobile-break"> ${t("hero.titleB")}</h1><p>${t("hero.subtitle")}</p></div><div class="city"><span class="pulse"></span> <span id="city-name">${escape(city.name)}</span> <small id="city-kind"></small><span id="weather-pill" class="weather-pill" hidden></span><span id="nws-pill" class="nws-pill" hidden></span></div></section>
<section class="toolbar" aria-label="${t("toolbar.filtersAria")}"><label class="search"><span>⌕</span><input id="search" placeholder="${t("toolbar.searchPlaceholder")}" aria-label="${t("toolbar.searchAria")}"></label><div id="filters" class="filters"><button class="chip active" data-category="all">${t("toolbar.all")}</button>${Object.entries(
  categories,
)
  .map(
    ([k, c]) =>
      `<button class="chip" data-category="${k}"><span style="color:${c.color}">${c.icon}</span> ${c.label}</button>`,
  )
  .join("")}</div></section>
<section class="workspace"><aside><div class="list-header"><div><h2>${t("list.title")}</h2><p id="count">${t("list.loading")}</p></div><span class="live">${t("list.live")}</span></div><div class="tabs"><button id="active-tab" class="selected">${t("list.tabNow")}</button><button id="resolved-tab">${t("list.tabCleared")}</button></div><div id="list" aria-live="polite"></div><div class="aside-footer">${t("list.footer")}</div></aside><div class="map-wrap"><div id="map" aria-label="${t("map.ariaLabel", { city: city.name })}"></div><div class="map-note"><span class="pulse"></span> ${t("map.note")}</div><div id="heat-controls" class="heat-controls" hidden><label>${t("heat.windowLabel")} <select id="heat-window" aria-label="Heatmap time window"><option value="0">${t("heat.all")}</option><option value="24">${t("heat.day")}</option><option value="168">${t("heat.week")}</option></select></label></div><button id="locate" title="${t("map.locate")}" aria-label="${t("map.locate")}">⌖</button><div id="detail" hidden></div><div class="map-legend"><span>●</span> ${t("map.legendReported")} <i></i> ${t("map.legendDisclaimer")}</div></div></section>
<section class="bottom"><div><span class="leaf">✳</span><div><strong>${t("cta.title")}</strong><p>${t("cta.body")}</p></div></div><button id="report-bottom">${t("cta.button")} ↗</button></section><footer><span>${t("footer.tagline")}</span><span id="updated">${t("footer.connecting")}</span></footer></main>
<dialog id="report-dialog"><form id="report-form"><div class="dialog-head"><div class="eyebrow">${t("dialogs.report.eyebrow")}</div><button type="button" class="close" aria-label="${t("dialogs.report.closeAria")}">×</button></div><h2>${t("dialogs.report.title")}</h2><p>${t("dialogs.report.intro")}</p><label>${t("dialogs.report.typeLabel")}<select name="category">${Object.entries(
  categories,
)
  .map(([k, c]) => `<option value="${k}">${c.label}</option>`)
  .join(
    "",
  )}</select></label><label>${t("dialogs.report.headlineLabel")}<input name="title" required minlength="3" maxlength="100" placeholder="${t("dialogs.report.headlinePh")}"></label><label>${t("dialogs.report.locationLabel")}<input name="location" required minlength="3" maxlength="100" placeholder="${t("dialogs.report.locationPh")}"></label><div class="form-row"><label>${t("dialogs.report.latLabel")}<input name="lat" type="number" step="any" min="37.70" max="37.84" required></label><label>${t("dialogs.report.lngLabel")}<input name="lng" type="number" step="any" min="-122.53" max="-122.35" required></label></div><label>${t("dialogs.report.impactLabel")}<select name="severity"><option value="1">${t("dialogs.report.impactMinor")}</option><option value="2" selected>${t("dialogs.report.impactModerate")}</option><option value="3">${t("dialogs.report.impactMajor")}</option></select></label><label>${t("dialogs.report.descriptionLabel")}<textarea name="description" maxlength="500" rows="3" placeholder="${t("dialogs.report.descriptionPh")}"></textarea></label><label>${t("photo.uploadLabel")} <span class="optional-note">(${t("dialogs.report.optional")})</span><input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp"><span class="form-hint">${t("photo.uploadHint")}</span><span id="photo-preview" class="photo-preview" hidden><img alt="${t("photo.previewAlt")}"><button type="button" id="photo-remove">${t("photo.remove")}</button></span></label><div id="similar-box" class="similar-box" hidden></div><p class="form-note">${t("dialogs.report.formNote")}</p><p id="form-error" role="alert"></p><button class="primary submit" type="submit">${t("dialogs.report.submit")} ↗</button></form></dialog>
<dialog id="about-dialog"><button class="close" aria-label="${t("dialogs.about.closeAria")}">×</button><div class="eyebrow">${t("dialogs.about.eyebrow")}</div><h2>${t("dialogs.about.title")}</h2><p>${t("dialogs.about.intro")}</p><h3>${t("dialogs.about.estimatesTitle")}</h3><p>${t("dialogs.about.estimatesBody")}</p><h3>${t("dialogs.about.honestTitle")}</h3><p>${t("dialogs.about.honestBody")}</p><h3>${t("dialogs.about.shortcutsTitle")}</h3><p>${t("dialogs.about.shortcutsBody")}</p></dialog><dialog id="flag-dialog"><form id="flag-form"><div class="dialog-head"><div class="eyebrow">${t("dialogs.flag.eyebrow")}</div><button type="button" class="close" aria-label="${t("dialogs.flag.closeAria")}">×</button></div><h2>${t("dialogs.flag.title")}</h2><p>${t("dialogs.flag.intro")}</p><div class="flag-reasons"><label><input type="radio" name="reason" value="spam" required> ${t("dialogs.flag.reasonSpam")}</label><label><input type="radio" name="reason" value="inaccurate"> ${t("dialogs.flag.reasonInaccurate")}</label><label><input type="radio" name="reason" value="inappropriate"> ${t("dialogs.flag.reasonInappropriate")}</label><label><input type="radio" name="reason" value="duplicate"> ${t("dialogs.flag.reasonDuplicate")}</label></div><p id="flag-error" role="alert"></p><button class="primary submit" type="submit">${t("dialogs.flag.submit")}</button></form></dialog><dialog id="alert-dialog"><form id="alert-form"><div class="dialog-head"><div class="eyebrow">${t("dialogs.alert.eyebrow")}</div><button type="button" class="close" aria-label="${t("dialogs.alert.closeAria")}">×</button></div><h2>${t("dialogs.alert.title")}</h2><p>${t("dialogs.alert.intro")}</p><label>${t("dialogs.alert.nameLabel")}<input name="label" required minlength="1" maxlength="60" placeholder="${t("dialogs.alert.namePh")}"></label><label>${t("dialogs.alert.radiusLabel")}<select name="radiusM"><option value="100">${t("dialogs.alert.r100")}</option><option value="250" selected>${t("dialogs.alert.r250")}</option><option value="500">${t("dialogs.alert.r500")}</option><option value="1000">${t("dialogs.alert.r1km")}</option><option value="2500">${t("dialogs.alert.r25km")}</option><option value="5000">${t("dialogs.alert.r5km")}</option></select></label><p id="alert-error" role="alert"></p><button class="primary submit" type="submit">${t("dialogs.alert.submit")}</button></form></dialog><dialog id="leaders-dialog"><button class="close" aria-label="${t("dialogs.leaders.closeAria")}">×</button><div class="eyebrow">${t("dialogs.leaders.eyebrow")}</div><h2>${t("dialogs.leaders.title")}</h2><div id="leaders-list"><p class="comments-empty">Loading…</p></div></dialog><dialog id="profile-dialog"><button class="close" aria-label="${t("dialogs.profile.closeAria")}">×</button><div class="eyebrow">${t("dialogs.profile.eyebrow")}</div><h2 id="profile-title">${t("dialogs.profile.title")}</h2><div id="profile-body"><p class="comments-empty">Loading…</p></div></dialog><dialog id="trends-dialog"><button class="close" aria-label="${t("dialogs.trends.closeAria")}">×</button><div class="eyebrow">${t("dialogs.trends.eyebrow")}</div><h2>${t("dialogs.trends.title")}</h2><p>${t("dialogs.trends.intro")}</p><canvas id="trends-chart" width="640" height="300" aria-label="${t("dialogs.trends.chartAria")}"></canvas><div id="trends-legend" class="trends-legend"></div><div id="trends-stats" class="trends-stats"></div></dialog><dialog id="import-dialog"><form id="import-form"><div class="dialog-head"><div class="eyebrow">${t("dialogs.import.eyebrow")}</div><button type="button" class="close" aria-label="${t("dialogs.import.closeAria")}">×</button></div><h2>${t("dialogs.import.title")}</h2><p>${t("dialogs.import.intro")}</p><label>${t("dialogs.import.fileLabel")}<input name="file" type="file" accept=".geojson,.json,application/json" required></label><p id="import-error" role="alert"></p><p id="import-status" role="status"></p><button class="primary submit" type="submit">Import reports</button></form></dialog><dialog id="moderation-dialog"><div class="dialog-head"><div class="eyebrow">${t("moderation.eyebrow")}</div><button type="button" class="close" aria-label="${t("dialogs.report.closeAria")}">×</button></div><h2>${t("moderation.title")}</h2><div id="moderation-auth"><p>${t("moderation.needToken")}</p><label>${t("moderation.tokenLabel")}<input id="moderation-token" type="password" autocomplete="off" placeholder="${t("moderation.tokenPh")}"></label><p id="moderation-error" role="alert"></p><button class="primary submit" id="moderation-unlock">${t("moderation.unlock")}</button></div><div id="moderation-list" hidden></div></dialog><div id="toast" role="status"></div>`;
$(".toolbar").insertAdjacentHTML(
  "beforebegin",
  '<section id="summary" class="summary" aria-label="City overview"></section>',
);
$(".toolbar").insertAdjacentHTML(
  "afterend",
  `<section class="discovery-controls" aria-label="${t("controls.prefsAria")}"><div><button id="saved-toggle" class="preference" aria-pressed="false">${t("controls.saved")} <span id="saved-count">0</span></button><button id="followed-toggle" class="preference" aria-pressed="false">${t("controls.followed")} <span id="followed-count">0</span></button><button id="alerts-toggle" class="preference" aria-pressed="false">${t("controls.alertZones")}</button><button id="draw-toggle" class="preference" aria-pressed="false">${t("controls.drawZone")}</button><button id="trip-toggle" class="preference" aria-pressed="false">${t("controls.tripCheck")}</button><button id="heat-toggle" class="preference" aria-pressed="false">${t("controls.heatmap")}</button><button id="bikes-toggle" class="preference" aria-pressed="false">${t("controls.bikeDocks")}</button><button id="cases-toggle" class="preference" aria-pressed="false">${t("controls.cases311")}</button><button id="nws-toggle" class="preference" aria-pressed="false">${t("controls.weatherAlerts")}</button><button id="leaders" class="preference">${t("controls.topNeighbors")}</button><button id="moderation" class="preference">${t("controls.moderation")}</button><button id="trends" class="preference">${t("controls.trends")}</button><label><input id="major-only" type="checkbox"> ${t("controls.majorOnly")}</label><label><input id="hide-demo" type="checkbox"> ${t("controls.hideDemo")}</label><button id="export-csv" class="preference">${t("controls.exportCsv")}</button><button id="export-geojson" class="preference">${t("controls.exportGeojson")}</button><button id="import-geojson" class="preference">${t("controls.importGeojson")}</button><label class="opacity-label">${t("controls.layerOpacity")} <input id="layer-opacity" type="range" min="20" max="100" value="100" aria-label="Enrichment layer opacity"></label></div><label class="sort-label">${t("controls.sortBy")} <select id="sort"><option value="recent">${t("controls.sortRecent")}</option><option value="impact">${t("controls.sortImpact")}</option><option value="confirmed">${t("controls.sortConfirmed")}</option></select></label></section>`,
);
$(".discovery-controls").insertAdjacentHTML(
  "afterend",
  `<section id="alerts-panel" class="alerts-panel" hidden aria-label="${t("alerts.panelTitle")}"></section><section id="trip-panel" class="trip-panel" hidden aria-label="Trip check"></section><section id="layer-filters" class="layer-filters" hidden aria-label="Enrichment layer filters"></section>`,
);
if (embedMode) {
  $(".map-wrap").insertAdjacentHTML(
    "beforeend",
    `<a class="embed-open" href="/?city=${city.id}" target="_blank" rel="noopener noreferrer">${t("embed.openFull")}</a>`,
  );
}
const map = L.map("map", { zoomControl: false }).setView(
  city.center,
  city.zoom,
);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  maxZoom: 19,
}).addTo(map);
const markers = L.layerGroup().addTo(map);
const alertCircles = L.layerGroup().addTo(map);
let alertMode = false,
  alertZones = [],
  alertMatches = [],
  alertAnchor = null;
// Declared here so the map click router can branch; trip-check UI lands in batch 3.
let tripMode = false;
let chosen = map.getCenter(),
  pin;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
async function api(path, body, method) {
  const verb = method || (body === undefined ? "GET" : "POST");
  const response = await fetch(
    "/api" + path,
    verb === "GET"
      ? { headers: { "X-Visitor-Id": visitor } }
      : {
          method: verb,
          headers: {
            "Content-Type": "application/json",
            "X-Visitor-Id": visitor,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  // Every successful write may earn XP; re-fetch the gamification profile and
  // celebrate a level-up. Fire-and-forget: the profile loader swallows errors.
  if (verb !== "GET") refreshProfile();
  return data;
}
function age(t) {
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return mins < 1
    ? "just now"
    : mins < 60
      ? `${mins}m ago`
      : `${Math.floor(mins / 60)}h ago`;
}
// Inline attachments take precedence over legacy photo URLs.
function photoFor(r) {
  return r.photo || r.photoUrl || "";
}
// Reports the visitor already thanked, persisted locally.
const kudoed = readIdSet(localStorage, "friction-kudoed");
const isFresh = (r) => Date.now() - r.createdAt < 24 * 3600 * 1000;
// The pending compressed photo for the report form (data URL or null).
let pendingPhoto = null;
async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = 0.72,
      url = canvas.toDataURL("image/jpeg", quality);
    while (url.length > 300 * 1024 && quality > 0.4) {
      quality -= 0.1;
      url = canvas.toDataURL("image/jpeg", quality);
    }
    return url;
  } finally {
    bitmap.close();
  }
}
function visible() {
  return filterReports(
    reports,
    {
      status,
      category,
      query,
      majorOnly,
      hideDemo,
      savedOnly,
      followedOnly,
      sort,
    },
    saved,
    followed,
  );
}
function render() {
  const stats = summarize(
    reports.filter((r) => (!hideDemo || !r.demo) && !r.hidden),
  );
  $("#summary").innerHTML =
    `<div><span class="summary-symbol">◉</span><strong>${stats.active}</strong><span>${t("summary.active")}</span></div><div><span class="summary-symbol red">↗</span><strong>${stats.major}</strong><span>${t("summary.major")}</span></div><div><span class="summary-symbol amber">◷</span><strong>${stats.stale}</strong><span>${t("summary.stale")}</span></div><div><span class="summary-symbol">✓</span><strong>${stats.resolved}</strong><span>${t("summary.resolved")}</span></div><small>${t("summary.citywide")} · ${hideDemo ? t("summary.citywideCommunity") : t("summary.citywideDemo")}</small>`;
  $("#saved-count").textContent = reports.filter((r) => saved.has(r.id)).length;
  $("#followed-count").textContent = followed.size;
  $("#city-kind").textContent = reports.some((r) => r.demo)
    ? t("hero.community")
    : t("hero.shared");
  const rows = visible();
  $("#count").textContent =
    `${status === "active" ? t("list.countActive", { count: rows.length }) : t("list.countCleared", { count: rows.length })}`;
  const emptyIcon = savedOnly ? "☆" : followedOnly ? "🔔" : "☀";
  const emptyTitle = savedOnly
    ? t("empty.savedTitle")
    : followedOnly
      ? t("empty.followedTitle")
      : t("empty.defaultTitle");
  const emptyHint = savedOnly
    ? t("empty.savedHint")
    : followedOnly
      ? t("empty.followedHint")
      : t("empty.defaultHint");
  $("#list").innerHTML = rows.length
    ? rows
        .map((r) => {
          const c = categories[r.category];
          return `<button class="report-card ${selected === r.id ? "chosen" : ""}" data-id="${r.id}"><div class="card-top"><span class="category-icon" style="--accent:${c.color}">${c.icon}</span><span class="category-label">${c.label}</span>${r.demo ? `<span class="demo">${t("card.demo")}</span>` : ""}${isFresh(r) && r.status === "active" ? `<span class="fresh-badge">${t("freshness.new")}</span>` : ""}${unseen.has(r.id) ? `<span class="unseen-dot" title="${t("card.newUpdates")}">●</span>` : ""}<span class="age">${age(r.updatedAt)}</span></div><h3>${escape(r.title)}</h3><p class="place">${escape(r.location)}</p><div class="card-bottom"><span class="estimate">${r.status === "resolved" ? t("card.cleared") : `◷ ${escape(r.prediction.label)}`}</span><span>♧ ${t("card.confirmations", { n: r.confirmations })}</span>${r.commentCount ? `<span>💬 ${r.commentCount}</span>` : ""}${photoFor(r) ? `<span title="${t("card.photoTitle")}">📷</span>` : ""}<span class="kudos-btn" data-kudos="${r.id}" role="button" tabindex="0" aria-pressed="${kudoed.has(r.id)}" title="${t("kudos.thank")}">${kudoed.has(r.id) ? t("kudos.thanked") : t("kudos.thank")}${r.kudosCount ? ` ${r.kudosCount}` : ""}</span></div></button>`;
        })
        .join("")
    : `<div class="empty"><span>${emptyIcon}</span><h3>${emptyTitle}</h3><p>${emptyHint}</p><button id="reset-filters">${t("empty.reset")}</button></div>`;
  markers.clearLayers();
  rows.forEach((r) => {
    const c = categories[r.category];
    const marker = L.marker([r.lat, r.lng], {
      title: r.title,
      icon: L.divIcon({
        className: "friction-marker",
        html: `<span style="--accent:${c.color}" class="${selected === r.id ? "picked" : ""}">${c.icon}</span>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      }),
    })
      .addTo(markers)
      .bindPopup(popupHtml(r))
      .on("click", () => select(r.id));
    // Rich popups open on hover; clicks still open the detail panel.
    marker.on("mouseover", () => marker.openPopup());
    marker.on("popupopen", () => loadPopupNote(marker, r));
  });
  if (selected) {
    // Rebuilding the detail panel wipes a half-typed neighbor note, so only
    // re-render it when the underlying report actually changed.
    const r = reports.find((x) => x.id === selected);
    const key = r
      ? `${r.updatedAt}:${r.commentCount || 0}:${r.status}:${r.clearVotes}:${r.confirmations}:${r.hidden ? 1 : 0}:${r.flagCount || 0}:${r.kudosCount || 0}:${kudoed.has(r.id) ? 1 : 0}`
      : "gone";
    if (key !== lastDetailKey) {
      lastDetailKey = key;
      renderDetail();
    }
  }
  if (heatLayer) heatLayer.setLatLngs(heatPoints());
  if (tripMode) renderTripPanel();
  $("#updated").textContent = lastUpdated
    ? t("footer.updated", { age: age(lastUpdated) })
    : t("footer.connecting");
}
function select(id) {
  selected = id;
  lastDetailKey = null;
  if (unseen.delete(id)) writeIdSet(localStorage, "friction-unseen", unseen);
  const r = reports.find((x) => x.id === id);
  history.replaceState(null, "", `/r/${id}`);
  map.flyTo([r.lat, r.lng], 15, { duration: 0.5 });
  render();
}
function closeDetail() {
  selected = null;
  lastDetailKey = null;
  history.replaceState(null, "", "/");
  $("#detail").hidden = true;
  render();
}
// Marker popups show a photo thumbnail, the top neighbor note, and the flag
// count. The note snippet loads lazily on first open and is cached per
// report so hovering the map never spams the comments endpoint.
const popupNoteCache = new Map();
function popupHtml(r, note) {
  const c = categories[r.category];
  const flags =
    r.flagCount > 0
      ? r.flagCount === 1
        ? ` · ${t("popup.flagOne")}`
        : ` · ${t("popup.flagsMany", { n: r.flagCount })}`
      : "";
  const snippet = note && note.length > 140 ? note.slice(0, 140) + "…" : note;
  const photo = photoFor(r);
  return `<div class="marker-popup"><div class="popup-title">${escape(r.title)}</div><div class="popup-meta">${c.icon} ${c.label} · ♧ ${r.confirmations}${flags}</div>${photo ? `<img src="${photo.startsWith("data:") ? photo : escape(photo)}" alt="${t("detail.photoAlt")}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${snippet ? `<p class="popup-note">💬 ${escape(snippet)}</p>` : ""}</div>`;
}
async function loadPopupNote(marker, r) {
  if (popupNoteCache.has(r.id)) {
    const note = popupNoteCache.get(r.id);
    if (note) marker.setPopupContent(popupHtml(r, note));
    return;
  }
  popupNoteCache.set(r.id, null);
  try {
    const comments = await api(`/reports/${r.id}/comments`);
    const top = comments.find((cm) => cm && cm.body);
    if (top) {
      popupNoteCache.set(r.id, top.body);
      if (marker.isPopupOpen()) marker.setPopupContent(popupHtml(r, top.body));
    }
  } catch {
    // The static popup content (photo, flags) is still useful on its own.
  }
}
// Keyboard shortcuts: / focuses search, ? opens this guide, f toggles the
// followed filter, and Escape backs out of dialogs, modes, and the detail.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    let closed = false;
    for (const d of document.querySelectorAll("dialog[open]")) {
      d.close();
      closed = true;
    }
    if (selected) {
      closeDetail();
      closed = true;
    }
    if (tripMode) {
      $("#trip-toggle").click();
      closed = true;
    }
    if (alertMode) {
      $("#alerts-toggle").click();
      closed = true;
    }
    if (drawMode) {
      cancelDraw();
      closed = true;
    }
    if (closed) e.preventDefault();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isTypingTarget(document.activeElement)) return;
  const action = shortcutFor(e.key);
  if (action === "focus-search") {
    e.preventDefault();
    $("#search").focus();
  } else if (action === "open-about") {
    $("#about-dialog").showModal();
  } else if (action === "toggle-followed") {
    $("#followed-toggle").click();
  }
});
function helpfulLabel(count) {
  return count ? t("detail.helpfulCount", { count }) : t("detail.helpful");
}
function commentHtml(c) {
  return `<div class="comment" data-comment="${c.id}"><div class="comment-meta"><strong>${escape(c.author)}</strong><span>${age(c.createdAt)}</span></div><p>${escape(c.body)}</p><div class="comment-actions"><button class="helpful" data-react="${c.id}" aria-pressed="false">${helpfulLabel(c.helpfulCount)}</button><button data-reply="${c.id}">${t("detail.replyButton")}</button></div>${c.replies && c.replies.length ? `<div class="replies">${c.replies.map(replyHtml).join("")}</div>` : ""}</div>`;
}
function replyHtml(c) {
  return `<div class="comment reply" data-comment="${c.id}"><div class="comment-meta"><strong>${escape(c.author)}</strong><span>${age(c.createdAt)}</span></div><p>${escape(c.body)}</p><div class="comment-actions"><button class="helpful" data-react="${c.id}" aria-pressed="false">${helpfulLabel(c.helpfulCount)}</button></div></div>`;
}
async function loadComments(id) {
  commentsFor = id;
  try {
    const comments = await api(`/reports/${id}/comments`);
    if (commentsFor !== id || !$("#comment-list")) return;
    $("#comment-list").innerHTML = comments.length
      ? comments.map(commentHtml).join("")
      : `<p class="comments-empty">${t("detail.notesEmpty")}</p>`;
  } catch {
    if (commentsFor === id && $("#comment-list"))
      $("#comment-list").innerHTML =
        `<p class="comments-empty">${t("detail.notesError")}</p>`;
  }
}
function renderDetail() {
  const r = reports.find((x) => x.id === selected);
  if (!r) {
    $("#detail").hidden = true;
    return;
  }
  const c = categories[r.category];
  $("#detail").hidden = false;
  const detailPhoto = photoFor(r);
  const detailPhotoHtml = !detailPhoto
    ? ""
    : detailPhoto.startsWith("data:")
      ? `<span class="report-photo"><img src="${detailPhoto}" alt="${t("detail.photoAlt")}" loading="lazy" onerror="this.closest('.report-photo').remove()"></span>`
      : `<a class="report-photo" href="${escape(detailPhoto)}" target="_blank" rel="noopener noreferrer"><img src="${escape(detailPhoto)}" alt="${t("detail.photoAlt")}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.report-photo').remove()"></a>`;
  const timelineItems = [
    `<li><span>📝</span> ${t("timeline.created", { age: age(r.createdAt) })}</li>`,
    `<li><span>♧</span> ${t("timeline.confirmations", { n: r.confirmations })}</li>`,
    `<li><span>🙏</span> ${t("timeline.kudos", { n: r.kudosCount || 0 })}</li>`,
    `<li><span>💬</span> ${t("timeline.comments", { n: r.commentCount || 0 })}</li>`,
  ];
  if (r.status === "resolved" && r.resolvedAt)
    timelineItems.push(
      `<li><span>✓</span> ${t("timeline.clearedOn", { age: age(r.resolvedAt) })}</li>`,
    );
  $("#detail").innerHTML =
    `<button class="close" id="close-detail" aria-label="${t("detail.closeAria")}">×</button><div class="eyebrow" style="color:${c.color}">${c.label}${r.demo ? t("detail.demoSuffix") : ""}</div><h2>${escape(r.title)}</h2><p class="place">${escape(r.location)}</p>${detailPhotoHtml}<p>${escape(r.description)}</p>${r.hidden ? `<p class="hidden-notice">${t("detail.hiddenNotice")}</p>` : ""}<div class="prediction"><span>${t("detail.estimateTitle")}<strong>${r.status === "resolved" ? t("detail.cleared") : escape(r.prediction.label)}</strong></span><span class="confidence">${t("detail.confidence", { label: r.prediction.confidence })}</span></div><p class="detail-note">${t("detail.metaLine", { confirmations: r.confirmations, votes: r.clearVotes })}</p>${r.hidden ? "" : r.status === "active" ? `<div class="detail-actions"><button class="primary" data-vote="confirm">${t("detail.voteConfirm")}</button><button data-vote="clear">${t("detail.voteClear")}</button></div>` : `<p>${t("detail.communityCleared")}</p>`}<div class="timeline"><h3>${t("timeline.title")}</h3><ul>${timelineItems.join("")}</ul></div>`;
  $("#detail").insertAdjacentHTML(
    "beforeend",
    `<div class="report-tools"><button id="save-report" aria-pressed="${saved.has(r.id)}">${saved.has(r.id) ? t("detail.saveOn") : t("detail.saveOff")}</button><button id="follow-report" aria-pressed="${followed.has(r.id)}">${followed.has(r.id) ? t("detail.followOn") : t("detail.followOff")}</button><button id="kudos-report" aria-pressed="${kudoed.has(r.id)}">${kudoed.has(r.id) ? t("kudos.thanked") : t("kudos.thank")}${r.kudosCount ? ` · ${r.kudosCount}` : ""}</button><button id="flag-report">${t("detail.flag")}</button><button id="share-report">${t("detail.share")} ↗</button></div><div class="impact-line">${["", t("detail.severity1"), t("detail.severity2"), t("detail.severity3")][r.severity]} ${t("detail.firstReported", { age: age(r.createdAt) })}</div><div class="comments"><h3>${t("detail.notesTitle")}</h3><div id="comment-list"><p class="comments-empty">${t("detail.notesLoading")}</p></div><form id="comment-form"><input name="note" maxlength="300" placeholder="${t("detail.notePlaceholder")}" aria-label="${t("detail.noteAria")}" autocomplete="off"><button type="submit">${t("detail.post")}</button></form><p id="comment-error" role="alert"></p></div>`,
  );
  loadComments(r.id);
}
async function refresh() {
  try {
    const next = await api(`/reports?city=${city.id}`);
    const updates = detectUpdates(next, followed, seen);
    reports = next;
    lastUpdated = Date.now();
    if (updates.length) {
      for (const u of updates) unseen.add(u.id);
      writeIdSet(localStorage, "friction-unseen", unseen);
      const preview = updates
        .slice(0, 2)
        .map((u) => `“${u.title}”: ${u.changes.join(", ")}`)
        .join(" · ");
      toast(
        updates.length === 1
          ? t("toasts.followedUpdateOne", { n: 1, preview, more: "" })
          : t("toasts.followedUpdateMany", {
              n: updates.length,
              preview,
              more: updates.length > 2 ? "…" : "",
            }),
      );
    }
    seen = snapshotReports(next);
    writeSnapshot(localStorage, seen);
    await refreshAlerts();
    if (initialReport) {
      const id = initialReport;
      initialReport = null;
      const target = reports.find((r) => r.id === id);
      if (target) {
        // A shared /r/:id link may point at another city — switch there first.
        if (target.city && target.city !== city.id) {
          await switchCity(target.city, { keepReport: id });
          return;
        }
        status = target.status;
        $("#active-tab").classList.toggle("selected", status === "active");
        $("#resolved-tab").classList.toggle("selected", status === "resolved");
        select(target.id);
      } else toast(t("toasts.sharedNotFound"));
    }
    render();
  } catch (e) {
    $("#count").textContent = t("list.countError");
    $("#updated").textContent = t("footer.connectionLost");
    toast(e.message);
  }
}
// Thanks are optimistic: the local kudoed set flips immediately, the server
// call confirms, and a failure rolls the UI back with a toast.
async function toggleKudos(reportId) {
  const r = reports.find((x) => x.id === reportId);
  const had = kudoed.has(reportId);
  if (had) kudoed.delete(reportId);
  else kudoed.add(reportId);
  writeIdSet(localStorage, "friction-kudoed", kudoed);
  if (r) r.kudosCount = Math.max(0, (r.kudosCount || 0) + (had ? -1 : 1));
  lastDetailKey = null;
  render();
  try {
    const result = await api(`/reports/${reportId}/kudos`, {});
    if (r) r.kudosCount = result.kudosCount;
    if (result.kudoed) kudoed.add(reportId);
    else kudoed.delete(reportId);
    writeIdSet(localStorage, "friction-kudoed", kudoed);
    lastDetailKey = null;
    render();
    toast(result.kudoed ? t("kudos.toastThanks") : t("kudos.toastUnthanks"));
  } catch (error) {
    if (had) kudoed.add(reportId);
    else kudoed.delete(reportId);
    writeIdSet(localStorage, "friction-kudoed", kudoed);
    if (r) r.kudosCount = Math.max(0, (r.kudosCount || 0) + (had ? 1 : -1));
    lastDetailKey = null;
    render();
    toast(error.message);
  }
}
$("#list").addEventListener("click", (e) => {
  if (e.target.closest("#reset-filters")) {
    resetFilters();
    return;
  }
  const kudosBtn = e.target.closest("[data-kudos]");
  if (kudosBtn) {
    e.stopPropagation();
    toggleKudos(kudosBtn.dataset.kudos);
    return;
  }
  const card = e.target.closest("[data-id]");
  if (card) select(card.dataset.id);
});
$("#list").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const kudosBtn = e.target.closest("[data-kudos]");
  if (kudosBtn) {
    e.preventDefault();
    toggleKudos(kudosBtn.dataset.kudos);
  }
});
// ---- Multi-city: switching, chrome, and the server city list ----
function applyCityToChrome() {
  map.setView(city.center, city.zoom);
  $("#brand-city").textContent = city.short;
  $("#city-name").textContent = city.name;
  $("#map").setAttribute("aria-label", t("map.ariaLabel", { city: city.name }));
  const form = $("#report-form");
  form.elements.lat.min = city.bounds.lat[0];
  form.elements.lat.max = city.bounds.lat[1];
  form.elements.lng.min = city.bounds.lng[0];
  form.elements.lng.max = city.bounds.lng[1];
  // Layer toggles only light up where the city actually has a feed.
  $("#bikes-toggle").disabled = !city.hasBikeshare;
  $("#bikes-toggle").title = city.hasBikeshare
    ? ""
    : `Bike-share data isn't available in ${city.name} yet.`;
  $("#cases-toggle").disabled = !city.hasCases311;
  $("#cases-toggle").title = city.hasCases311
    ? ""
    : `311 data isn't available in ${city.name} yet.`;
}
async function switchCity(id, opts = {}) {
  const next = resolveCity(cities, id);
  if (!next) return;
  if (next.id === city.id && !opts.keepReport) return;
  city = next;
  selected = null;
  lastDetailKey = null;
  $("#detail").hidden = true;
  // Per-city state: drop layers, trip route, and heatmap from the old city.
  bikesOn = casesOn = nwsOn = false;
  for (const b of ["#bikes-toggle", "#cases-toggle", "#nws-toggle"])
    $(b).setAttribute("aria-pressed", "false");
  bikeLayer.clearLayers();
  caseLayer.clearLayers();
  nwsLayer.clearLayers();
  caseData = [];
  caseTypeFilter = null;
  renderLayerFilters();
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
    $("#heat-controls").hidden = true;
    $("#heat-toggle").setAttribute("aria-pressed", "false");
  }
  tripPath = [];
  tripLayer.clearLayers();
  renderTripPanel();
  applyCityToChrome();
  await refresh();
  refreshWeather();
  refreshNwsBanner();
  if (opts.keepReport) {
    const target = reports.find((r) => r.id === opts.keepReport);
    if (target) select(target.id);
    else toast(t("toasts.sharedNotFound"));
  }
}
async function loadCities() {
  try {
    const list = await api("/cities");
    if (Array.isArray(list) && list.length) cities = list;
  } catch {
    // The bundled registry stays in effect.
  }
  city = resolveCity(cities, city.id);
  applyCityToChrome();
  initCitySwitcher({
    cities,
    current: city.id,
    mount: $("#city-slot"),
    onChange: (id) => switchCity(id),
  });
}
$("#filters").addEventListener("click", (e) => {
  const button = e.target.closest("[data-category]");
  if (!button) return;
  category = button.dataset.category;
  document
    .querySelectorAll(".chip")
    .forEach((b) => b.classList.toggle("active", b === button));
  selected = null;
  lastDetailKey = null;
  $("#detail").hidden = true;
  render();
});
function resetFilters() {
  category = "all";
  query = "";
  majorOnly = false;
  hideDemo = false;
  savedOnly = false;
  followedOnly = false;
  selected = null;
  lastDetailKey = null;
  $("#detail").hidden = true;
  $("#search").value = "";
  $("#major-only").checked = false;
  $("#hide-demo").checked = false;
  $("#saved-toggle").setAttribute("aria-pressed", "false");
  $("#followed-toggle").setAttribute("aria-pressed", "false");
  document
    .querySelectorAll(".chip")
    .forEach((b) => b.classList.toggle("active", b.dataset.category === "all"));
  render();
}
$("#saved-toggle").onclick = () => {
  savedOnly = !savedOnly;
  $("#saved-toggle").setAttribute("aria-pressed", String(savedOnly));
  render();
};
$("#followed-toggle").onclick = () => {
  followedOnly = !followedOnly;
  $("#followed-toggle").setAttribute("aria-pressed", String(followedOnly));
  render();
};
$("#export-csv").onclick = () => {
  const rows = visible();
  if (!rows.length) return toast(t("toasts.nothingToExport"));
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `city-friction-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(
    `${rows.length === 1 ? t("toasts.exportCsvOne") : t("toasts.exportCsvMany", { n: rows.length })}`,
  );
};
$("#alerts-toggle").onclick = () => {
  alertMode = !alertMode;
  $("#alerts-toggle").setAttribute("aria-pressed", String(alertMode));
  toast(alertMode ? t("toasts.alertModeOn") : t("toasts.alertModeOff"));
};
$("#alert-form").onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector(".submit");
  button.disabled = true;
  $("#alert-error").textContent = "";
  try {
    await api("/alerts", {
      label: form.elements.label.value,
      radiusM: drawnRadiusM || Number(form.elements.radiusM.value),
      lat: alertAnchor.lat,
      lng: alertAnchor.lng,
      city: city.id,
    });
    $("#alert-dialog").close();
    form.reset();
    toast(t("toasts.zoneSaved"));
    await refreshAlerts();
  } catch (error) {
    $("#alert-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
async function refreshAlerts() {
  try {
    alertZones = await api("/alerts");
    alertMatches = alertZones.length ? await api("/alerts/matches") : [];
  } catch {
    alertZones = [];
    alertMatches = [];
  }
  alertCircles.clearLayers();
  for (const zone of alertZones)
    L.circle([zone.lat, zone.lng], {
      radius: zone.radiusM,
      color: "#3979a0",
      weight: 1.5,
      fillOpacity: 0.07,
    })
      .addTo(alertCircles)
      .bindTooltip(escape(zone.label));
  renderAlertPanel();
}
function renderAlertPanel() {
  const panel = $("#alerts-panel");
  if (!alertZones.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  panel.innerHTML =
    `<h2>${t("alerts.panelTitle")}</h2>` +
    alertMatches
      .map(
        ({ zone, matches }) =>
          `<div class="alert-zone"><div><strong>${escape(zone.label)}</strong><span>${zone.radiusM >= 1000 ? t("alerts.radiusKm", { n: zone.radiusM / 1000 }) : t("alerts.radiusM", { n: zone.radiusM })}</span></div><span class="alert-count">${t("alerts.activeNearby", { n: matches.length })}</span><button data-delete-zone="${zone.id}" aria-label="${t("alerts.deleteAria", { label: escape(zone.label) })}">×</button></div>`,
      )
      .join("");
}
$("#alerts-panel").addEventListener("click", async (e) => {
  const button = e.target.closest("[data-delete-zone]");
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/alerts/${button.dataset.deleteZone}`, undefined, "DELETE");
    toast(t("toasts.zoneRemoved"));
    await refreshAlerts();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});
$("#leaders").onclick = async () => {
  $("#leaders-list").innerHTML =
    `<p class="comments-empty">${t("dialogs.leaders.loading")}</p>`;
  $("#leaders-dialog").showModal();
  try {
    const leaders = await api(`/contributors?city=${city.id}`);
    const medals = ["🥇", "🥈", "🥉"];
    $("#leaders-list").innerHTML = leaders.length
      ? `<ol>${leaders
          .slice(0, 10)
          .map(
            (l, i) =>
              `<li><span class="medal">${medals[i] || `${i + 1}.`}</span><strong>${escape(l.name)}</strong> <span class="leader-level" title="${escape(l.levelName || "")}">${l.levelIcon || ""}</span><span class="leader-stats">${t("dialogs.leaders.stats", { score: l.score, reports: l.reports, notes: l.notes, confirmations: l.confirmations })}</span></li>`,
          )
          .join("")}</ol>`
      : `<p class="comments-empty">${t("dialogs.leaders.empty")}</p>`;
  } catch {
    $("#leaders-list").innerHTML =
      `<p class="comments-empty">${t("dialogs.leaders.error")}</p>`;
  }
};
const tripLayer = L.layerGroup().addTo(map);
let tripPath = [],
  tripWidthM = 250,
  heatHours = 0;
let heatLayer = null;
function tripClick(latlng) {
  tripPath.push(latlng);
  redrawTrip();
}
function redrawTrip() {
  tripLayer.clearLayers();
  tripPath.forEach((p, i) => {
    const stop = L.marker([p.lat, p.lng], {
      draggable: true,
      icon: L.divIcon({
        className: "trip-stop",
        html: `<span>${i + 1}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    })
      .addTo(tripLayer)
      .bindTooltip(t("trip.stopTooltip", { n: i + 1 }));
    stop.on("dragend", () => {
      tripPath[i] = stop.getLatLng();
      redrawTrip();
    });
  });
  if (tripPath.length >= 2)
    L.polyline(
      tripPath.map((p) => [p.lat, p.lng]),
      { color: "#9360af", weight: 4, opacity: 0.8 },
    ).addTo(tripLayer);
  renderTripPanel();
}
function renderTripPanel() {
  const panel = $("#trip-panel");
  if (!tripMode) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const hits = corridorReports(reports, tripPath, tripWidthM);
  const hint =
    tripPath.length < 2
      ? t("trip.hintStart")
      : t("trip.hintRoute", {
          stops: tripPath.length,
          hits: hits.length,
          s: hits.length === 1 ? "" : "s",
          w: tripWidthM,
        });
  panel.innerHTML =
    `<div class="trip-head"><h2>${t("trip.title")}</h2><button id="trip-clear">${t("trip.clear")}</button></div>` +
    `<p>${hint}</p>` +
    `<label class="trip-width">${t("trip.widthLabel")} <input id="trip-width" type="range" min="50" max="2000" step="50" value="${tripWidthM}" aria-label="${t("trip.widthLabel")}"> <strong>${t("trip.widthM", { n: tripWidthM })}</strong></label>` +
    (hits.length
      ? `<ul class="trip-hits">${hits
          .map(
            (r) =>
              `<li><button data-trip-report="${r.id}"><span class="trip-dist">${r.corridorM} m</span><span><strong>${escape(r.title)}</strong><small>${escape(r.location)}</small></span></button></li>`,
          )
          .join("")}</ul>`
      : tripPath.length >= 2
        ? `<p class="comments-empty">${t("trip.clearCorridor")}</p>`
        : "");
  $("#trip-width").oninput = (e) => {
    tripWidthM = clampWidth(e.target.value);
    renderTripPanel();
  };
  $("#trip-clear").onclick = () => {
    tripPath = [];
    redrawTrip();
  };
  panel
    .querySelectorAll("[data-trip-report]")
    .forEach((b) =>
      b.addEventListener("click", () => select(b.dataset.tripReport)),
    );
}
$("#trip-toggle").onclick = () => {
  tripMode = !tripMode;
  $("#trip-toggle").setAttribute("aria-pressed", String(tripMode));
  if (!tripMode) {
    tripPath = [];
    tripLayer.clearLayers();
  }
  renderTripPanel();
  toast(tripMode ? t("toasts.tripOn") : t("toasts.tripOff"));
};
$("#heat-toggle").onclick = async () => {
  const on = !heatLayer;
  $("#heat-toggle").setAttribute("aria-pressed", String(on));
  if (on) {
    try {
      await heatReady;
    } catch {
      $("#heat-toggle").setAttribute("aria-pressed", "false");
      return toast(t("toasts.heatmapError"));
    }
    heatLayer = L.heatLayer(heatPoints(), {
      radius: 30,
      blur: 22,
      maxZoom: 16,
      minOpacity: 0.35,
    }).addTo(map);
    heatLayer.bringToBack();
    $("#heat-controls").hidden = false;
    toast(t("toasts.heatmapOn"));
  } else {
    map.removeLayer(heatLayer);
    heatLayer = null;
    $("#heat-controls").hidden = true;
  }
};
$("#heat-window").onchange = (e) => {
  heatHours = Number(e.target.value);
  if (heatLayer) heatLayer.setLatLngs(heatPoints());
  toast(
    heatHours === 0
      ? t("toasts.heatmapAll")
      : heatHours === 24
        ? t("toasts.heatmapDay")
        : t("toasts.heatmapWeek"),
  );
};
function heatPoints() {
  const cutoff = heatHours ? Date.now() - heatHours * 3600 * 1000 : 0;
  return visible()
    .filter((r) => !r.hidden && r.updatedAt >= cutoff)
    .map((r) => [r.lat, r.lng, r.severity / 3]);
}
// ---- Live data enrichment layers: bike-share docks, 311 cases, weather,
// air quality, and NWS weather alerts. Each layer is a toolbar toggle over a
// cached server proxy (/api/enrich/*). When an upstream is down the proxy
// answers { available: false } and the toggle quietly stands down instead of
// showing dead UI.
const bikeLayer = L.layerGroup().addTo(map);
const caseLayer = L.layerGroup().addTo(map);
const nwsLayer = L.layerGroup().addTo(map);
let bikesOn = false,
  casesOn = false,
  nwsOn = false,
  caseData = [],
  caseTypeFilter = null;
async function refreshWeather() {
  const pill = $("#weather-pill");
  try {
    const [w, aq] = await Promise.all([
      api(`/enrich/weather?city=${city.id}`),
      api(`/enrich/airquality?city=${city.id}`).catch(() => ({
        available: false,
      })),
    ]);
    if (!w.available) {
      pill.hidden = true;
      return;
    }
    pill.hidden = false;
    const aqi =
      aq && aq.available
        ? t("popup.weatherAqi", { aqi: aq.aqi, label: aq.label })
        : "";
    pill.textContent =
      t("popup.weatherNow", {
        city: city.short,
        temp: Math.round(w.tempC),
        label: weatherLabel(w.code),
      }) + aqi;
    pill.title =
      t("popup.weatherTitle", {
        city: city.name,
        wind: Math.round(w.windKph),
      }) +
      (aq && aq.available ? t("popup.weatherPm25", { pm25: aq.pm25 }) : "");
  } catch {
    pill.hidden = true;
  }
}
refreshWeather();
setInterval(refreshWeather, 10 * 60 * 1000);
// Banner pill for National Weather Service alerts; doubles as the data source
// for the toggleable alert layer below.
async function refreshNwsBanner() {
  const pill = $("#nws-pill");
  try {
    const data = await api(`/enrich/alerts?city=${city.id}`);
    const alerts = data.available ? data.alerts : [];
    if (!alerts.length) {
      pill.hidden = true;
      return null;
    }
    pill.hidden = false;
    pill.textContent = t("popup.nwsAlert", {
      event: alerts[0].event,
      more: alerts.length > 1 ? ` +${alerts.length - 1}` : "",
    });
    pill.title = alerts
      .map(
        (a) =>
          `${a.event} · ${a.severity}${a.expires ? ` · until ${a.expires.slice(0, 16).replace("T", " ")}` : ""}`,
      )
      .join("\n");
    return alerts;
  } catch {
    pill.hidden = true;
    return null;
  }
}
refreshNwsBanner();
setInterval(refreshNwsBanner, 10 * 60 * 1000);
$("#nws-toggle").onclick = async () => {
  nwsOn = !nwsOn;
  $("#nws-toggle").setAttribute("aria-pressed", String(nwsOn));
  if (!nwsOn) {
    nwsLayer.clearLayers();
    return;
  }
  try {
    const alerts = await refreshNwsBanner();
    if (!alerts || !alerts.length || !nwsOn) throw new Error("unavailable");
    nwsLayer.clearLayers();
    for (const a of alerts) {
      const color = alertColor(a.severity);
      const tooltip =
        `<strong>⚠ ${escape(a.event)}</strong><br>${escape(a.severity)}` +
        (a.headline ? `<br>${escape(a.headline)}` : "");
      if (a.polygon) {
        // NWS polygons arrive as GeoJSON rings ([lng, lat]); Leaflet wants [lat, lng].
        const rings = a.polygon.map((ring) =>
          ring.map(([lng, lat]) => [lat, lng]),
        );
        L.polygon(rings, {
          color,
          weight: 2,
          dashArray: "6 4",
          fillColor: color,
          fillOpacity: 0.12,
        })
          .bindTooltip(tooltip)
          .addTo(nwsLayer);
      } else {
        // Zone alerts carry no geometry; render an area indicator over the city.
        L.circle(city.center, {
          radius: 6500,
          color,
          weight: 2,
          dashArray: "6 4",
          fillColor: color,
          fillOpacity: 0.06,
        })
          .bindTooltip(
            tooltip +
              `<br><em>${t("popup.nwsAreaNote", { city: city.name })}</em>`,
          )
          .addTo(nwsLayer);
      }
    }
    toast(
      alerts.length === 1
        ? t("toasts.weatherAlertsOne")
        : t("toasts.weatherAlertsMany", { n: alerts.length }),
    );
  } catch {
    nwsOn = false;
    $("#nws-toggle").setAttribute("aria-pressed", "false");
    toast(t("toasts.weatherUnavailable"));
  }
};
function openReportPrefill(prefill) {
  const form = $("#report-form");
  form.elements.category.value = prefill.category || "access";
  form.elements.title.value = prefill.title || "";
  form.elements.location.value = prefill.location || "";
  form.elements.lat.value = Number(prefill.lat).toFixed(6);
  form.elements.lng.value = Number(prefill.lng).toFixed(6);
  form.elements.description.value = prefill.description || "";
  $("#form-error").textContent = "";
  $("#report-dialog").showModal();
}
$("#bikes-toggle").onclick = async () => {
  bikesOn = !bikesOn;
  $("#bikes-toggle").setAttribute("aria-pressed", String(bikesOn));
  if (!bikesOn) {
    bikeLayer.clearLayers();
    return;
  }
  try {
    const data = await api(`/enrich/bikeshare?city=${city.id}`);
    if (!data.available || !bikesOn) throw new Error("unavailable");
    bikeLayer.clearLayers();
    for (const s of data.stations) {
      const color = dockColor(s);
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 5,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.65,
      }).addTo(bikeLayer);
      marker.bindPopup(
        `<div class="layer-popup"><strong>${escape(s.name)}</strong><br>${t("popup.stationAvailability", { bikes: s.bikes, docks: s.docks })}${s.ebikes ? t("popup.stationEbikes", { n: s.ebikes }) : ""}<br><button class="mini-action" type="button">${t("popup.reportDocks")}</button></div>`,
      );
      marker.on("popupopen", () => {
        const btn = marker
          .getPopup()
          .getElement()
          ?.querySelector(".mini-action");
        if (btn)
          btn.onclick = () => {
            marker.closePopup();
            openReportPrefill({
              category: "bikes",
              title: t("popup.prefillEmptyDocks", { name: s.name }).slice(
                0,
                100,
              ),
              location: s.name.slice(0, 100),
              lat: s.lat,
              lng: s.lng,
              description:
                t("popup.stationAvailability", {
                  bikes: s.bikes,
                  docks: s.docks,
                }) + ".",
            });
          };
      });
    }
    toast(
      t("toasts.bikesOn", {
        n: data.stations.length,
        network: data.name || city.short,
      }),
    );
  } catch {
    bikesOn = false;
    $("#bikes-toggle").setAttribute("aria-pressed", "false");
    toast(t("toasts.bikesUnavailable"));
  }
};
function drawCases() {
  caseLayer.clearLayers();
  const rows = caseTypeFilter
    ? caseData.filter((c) => c.type === caseTypeFilter)
    : caseData;
  for (const c of rows) {
    const color = caseColor(c.status);
    const marker = L.circleMarker([c.lat, c.lng], {
      radius: 4,
      color,
      weight: 1.5,
      fillColor: color,
      fillOpacity: 0.55,
    }).addTo(caseLayer);
    marker.bindPopup(
      `<div class="layer-popup"><strong>${escape(c.type)}</strong><br>${escape(c.status)}${c.address ? `<br>${escape(c.address)}` : ""}<br><button class="mini-action" type="button">${t("popup.addCase")}</button></div>`,
    );
    marker.on("popupopen", () => {
      const btn = marker.getPopup().getElement()?.querySelector(".mini-action");
      if (btn) btn.onclick = () => addCaseAsReport(c, marker);
    });
  }
}
function renderLayerFilters() {
  const box = $("#layer-filters");
  if (!casesOn || !caseData.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const counts = {};
  for (const c of caseData) counts[c.type] = (counts[c.type] || 0) + 1;
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  box.hidden = false;
  box.innerHTML =
    `<span class="layer-filters-label">${t("layers.filterLabel")}</span>` +
    top
      .map(
        (t) =>
          `<button class="layer-chip${caseTypeFilter === t ? " active" : ""}" data-case-type="${escape(t)}">${escape(t)}</button>`,
      )
      .join("") +
    (caseTypeFilter
      ? `<button class="layer-chip clear" data-case-type="">${t("layers.clearFilter")}</button>`
      : "");
  box.querySelectorAll("[data-case-type]").forEach((b) => {
    b.onclick = () => {
      caseTypeFilter = b.dataset.caseType || null;
      drawCases();
      renderLayerFilters();
    };
  });
}
async function addCaseAsReport(c, marker) {
  marker.closePopup();
  const button = marker.getPopup().getElement()?.querySelector(".mini-action");
  if (button) button.disabled = true;
  try {
    const result = await api("/reports", {
      category: caseCategory(c.type),
      title: c.type.slice(0, 100),
      location: (c.address || city.name).slice(0, 100),
      description: t("popup.caseSummary", {
        city: city.short,
        status: c.status ? c.status.toLowerCase() + " " : "",
        date: c.opened ? c.opened.slice(0, 10) : t("popup.caseDateUnknown"),
      }),
      lat: c.lat,
      lng: c.lng,
      severity: 2,
    });
    await refresh();
    if (result.merged) {
      toast(t("toasts.caseLinked"));
    } else {
      select(result.report.id);
      toast(t("toasts.caseAdded"));
    }
  } catch (error) {
    toast(error.message);
  }
}
$("#cases-toggle").onclick = async () => {
  casesOn = !casesOn;
  $("#cases-toggle").setAttribute("aria-pressed", String(casesOn));
  if (!casesOn) {
    caseData = [];
    caseTypeFilter = null;
    caseLayer.clearLayers();
    renderLayerFilters();
    return;
  }
  try {
    const data = await api(`/enrich/cases311?city=${city.id}`);
    if (!data.available || !casesOn) throw new Error("unavailable");
    caseData = data.cases;
    caseTypeFilter = null;
    drawCases();
    renderLayerFilters();
    toast(t("toasts.casesOn", { n: data.cases.length, city: city.short }));
  } catch {
    casesOn = false;
    $("#cases-toggle").setAttribute("aria-pressed", "false");
    toast(t("toasts.casesUnavailable"));
  }
};
// One opacity slider scales every enrichment layer at once.
$("#layer-opacity").oninput = (e) => {
  const f = Number(e.target.value) / 100;
  for (const layer of [bikeLayer, caseLayer, nwsLayer])
    layer.eachLayer((m) => {
      if (m.setStyle)
        m.setStyle({ opacity: Math.min(1, f), fillOpacity: 0.65 * f });
    });
};
// ---- Gamification: XP, levels, badges, streaks, and a weekly challenge.
// The profile is pure server-side computation over the visitor's existing
// contributions; the client just renders it and celebrates level-ups.
let profile = null,
  profileLoaded = false;
async function refreshProfile() {
  try {
    const next = await api("/gamification/me");
    const prevLevel = profile?.level?.name;
    profile = next;
    renderYouChip();
    if (profileLoaded && prevLevel && prevLevel !== next.level.name)
      toast(
        t("toasts.levelUp", { icon: next.level.icon, name: next.level.name }),
      );
    profileLoaded = true;
  } catch {
    // Anonymous or unreachable: the chip simply stays hidden.
  }
}
function renderYouChip() {
  if (!profile) return;
  $("#you-chip").hidden = false;
  $("#you-icon").textContent = profile.level.icon;
  $("#you-name").textContent = profile.level.name;
  $("#you-xp").style.width = `${Math.round(profile.level.progress * 100)}%`;
  $("#you-chip").title = t("dialogs.profile.chipTitle", {
    xp: profile.xp,
    streak: profile.streakDays,
  });
}
$("#you-chip").onclick = () => {
  renderProfileDialog();
  $("#profile-dialog").showModal();
};
function renderProfileDialog() {
  const body = $("#profile-body");
  if (!profile) {
    body.innerHTML = `<p class="comments-empty">${t("dialogs.profile.error")}</p>`;
    return;
  }
  const p = profile;
  $("#profile-title").innerHTML =
    `${p.level.icon} ${p.level.name} <small>${p.xp} XP</small>`;
  const earned = p.badges.filter((b) => b.earned).length;
  body.innerHTML =
    `<div class="profile-stats">` +
    `<div><strong>🔥 ${p.streakDays}</strong><span>${t("dialogs.profile.streakLabel")}</span></div>` +
    `<div><strong>${p.counts.reports}</strong><span>${t("dialogs.profile.reportsLabel")}</span></div>` +
    `<div><strong>${p.counts.confirms}</strong><span>${t("dialogs.profile.confirmationsLabel")}</span></div>` +
    `<div><strong>${p.counts.helpfulReceived}</strong><span>${t("dialogs.profile.helpfulLabel")}</span></div>` +
    `<div><strong>🙏 ${p.counts.kudosReceived || 0}</strong><span>${t("dialogs.profile.kudosLabel")}</span></div>` +
    `</div>` +
    `<div class="weekly"><div class="weekly-head"><strong>${t("dialogs.profile.weeklyTitle")}</strong><span>${p.weeklyChallenge.progress}/${p.weeklyChallenge.goal}</span></div>` +
    `<div class="xp-track big"><span class="xp-fill" style="width:${Math.round((p.weeklyChallenge.progress / p.weeklyChallenge.goal) * 100)}%"></span></div>` +
    `<p>${escape(p.weeklyChallenge.label)}</p></div>` +
    `<h3>${t("dialogs.profile.badgesTitle")} <small>${t("dialogs.profile.badgesCount", { earned, total: p.badges.length })}</small></h3>` +
    `<div class="badges">${p.badges
      .map(
        (b) =>
          `<div class="badge${b.earned ? " earned" : ""}"><span class="badge-icon">${b.icon}</span><strong>${escape(b.name)}</strong><small>${escape(b.desc)}</small></div>`,
      )
      .join("")}</div>` +
    (p.level.next
      ? `<p class="next-level">${t("dialogs.profile.nextLevel", { n: Math.max(0, p.level.next.min - p.xp), icon: p.level.next.icon, name: p.level.next.name })}</p>`
      : `<p class="next-level">${t("dialogs.profile.maxLevel")}</p>`);
}
refreshProfile();
// ---- Draw alert zones: press-drag a circle on the map, then name it. The
// drawn radius is rounded to 50 m, clamped to the server's 100–5000 m range,
// and offered as a one-off option in the zone dialog. Esc cancels mid-drag.
let drawMode = false,
  drawStart = null,
  drawCircle = null,
  drawnRadiusM = 0,
  suppressClick = false;
function cancelDraw() {
  drawMode = false;
  drawStart = null;
  if (drawCircle) {
    map.removeLayer(drawCircle);
    drawCircle = null;
  }
  map.dragging.enable();
  $("#draw-toggle").setAttribute("aria-pressed", "false");
}
$("#draw-toggle").onclick = () => {
  drawMode = !drawMode;
  if (drawMode && alertMode) $("#alerts-toggle").click();
  $("#draw-toggle").setAttribute("aria-pressed", String(drawMode));
  toast(drawMode ? t("toasts.drawModeOn") : t("toasts.drawModeOff"));
};
map.on("mousedown", (e) => {
  if (!drawMode || drawStart) return;
  drawStart = e.latlng;
  map.dragging.disable();
  drawCircle = L.circle(drawStart, {
    radius: 0,
    color: "#3979a0",
    weight: 2,
    fillOpacity: 0.1,
  }).addTo(map);
});
map.on("mousemove", (e) => {
  if (!drawMode || !drawStart || !drawCircle) return;
  drawCircle.setRadius(drawStart.distanceTo(e.latlng));
});
map.on("mouseup", (e) => {
  if (!drawMode || !drawStart) return;
  const radiusM = drawStart.distanceTo(e.latlng);
  const center = drawStart;
  cancelDraw();
  suppressClick = true;
  if (radiusM < 50) {
    toast(t("toasts.zoneTooSmall"));
    return;
  }
  openDrawnAlertDialog(center, radiusM);
});
function openDrawnAlertDialog(center, radiusM) {
  alertAnchor = { lat: center.lat, lng: center.lng };
  drawnRadiusM = Math.max(100, Math.min(5000, Math.round(radiusM / 50) * 50));
  const select = $("#alert-form").elements.radiusM;
  let option = select.querySelector("[data-drawn]");
  if (!option) {
    option = document.createElement("option");
    option.dataset.drawn = "1";
    select.appendChild(option);
  }
  option.value = String(drawnRadiusM);
  option.textContent = `≈${drawnRadiusM >= 1000 ? `${drawnRadiusM / 1000} km` : `${drawnRadiusM} m`} (drawn)`;
  select.value = String(drawnRadiusM);
  $("#alert-error").textContent = "";
  $("#alert-dialog").showModal();
}
$("#alert-dialog").addEventListener("close", () => {
  drawnRadiusM = 0;
  const option =
    $("#alert-form").elements.radiusM.querySelector("[data-drawn]");
  if (option) option.remove();
});
function drawTrends(days) {
  const canvas = $("#trends-chart");
  const ctx = canvas.getContext("2d");
  const names = Object.keys(categories);
  const W = canvas.width,
    H = canvas.height,
    padL = 34,
    padB = 26,
    padT = 12;
  const totals = days.map((d) => names.reduce((a, n) => a + (d[n] || 0), 0));
  const max = Math.max(1, ...totals);
  ctx.clearRect(0, 0, W, H);
  ctx.font = "10px system-ui";
  ctx.fillStyle = "#8a967d";
  for (let g = 0; g <= 4; g++) {
    const v = Math.round((max * g) / 4);
    const y = padT + (H - padB - padT) * (1 - g / 4);
    ctx.fillText(String(v), 6, y + 3);
    ctx.strokeStyle = "#eef2e8";
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - 6, y);
    ctx.stroke();
  }
  const slot = (W - padL - 10) / days.length;
  const barW = Math.max(4, slot * 0.62);
  days.forEach((d, i) => {
    let y = H - padB;
    const x = padL + i * slot + (slot - barW) / 2;
    for (const n of names) {
      const v = d[n] || 0;
      if (!v) continue;
      const h = ((H - padB - padT) * v) / max;
      y -= h;
      ctx.fillStyle = categories[n].color;
      ctx.fillRect(x, y, barW, h);
    }
    if (i % 2 === 0) {
      ctx.fillStyle = "#8a967d";
      ctx.fillText(d.date.slice(5), padL + i * slot, H - 10);
    }
  });
  $("#trends-legend").innerHTML = names
    .map(
      (n) =>
        `<span><i style="background:${categories[n].color}"></i>${categories[n].label}</span>`,
    )
    .join("");
}
function fmtMinutes(m) {
  if (m === null || m === undefined) return "—";
  return m < 60 ? `${m}m` : `${Math.round(m / 6) / 10}h`;
}
$("#trends").onclick = async () => {
  $("#trends-stats").innerHTML =
    `<p class="comments-empty">${t("dialogs.trends.loading")}</p>`;
  $("#trends-dialog").showModal();
  try {
    const trends = await api(`/trends?city=${city.id}`);
    drawTrends(trends.days);
    const t = trends.totals;
    $("#trends-stats").innerHTML =
      `<div><strong>${t.active}</strong><span>${t("dialogs.trends.statActive")}</span></div>` +
      `<div><strong>${t.resolved}</strong><span>${t("dialogs.trends.statResolved")}</span></div>` +
      `<div><strong>${t.notes}</strong><span>${t("dialogs.trends.statNotes")}</span></div>` +
      `<div><strong>${t.confirmations}</strong><span>${t("dialogs.trends.statConfirmations")}</span></div>` +
      `<div><strong>${fmtMinutes(trends.avgResolutionMinutes)}</strong><span>${t("dialogs.trends.statAvg")}</span></div>`;
  } catch {
    $("#trends-stats").innerHTML =
      `<p class="comments-empty">${t("dialogs.trends.error")}</p>`;
  }
};
$("#export-geojson").onclick = () => {
  const rows = visible();
  if (!rows.length) return toast(t("toasts.nothingToExport"));
  const blob = new Blob([JSON.stringify(toGeoJSON(rows), null, 2)], {
    type: "application/geo+json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `city-friction-${new Date().toISOString().slice(0, 10)}.geojson`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(
    `${rows.length === 1 ? t("toasts.exportGeojsonOne") : t("toasts.exportGeojsonMany", { n: rows.length })}`,
  );
};
$("#import-geojson").onclick = () => {
  $("#import-error").textContent = "";
  $("#import-status").textContent = "";
  $("#import-form").reset();
  $("#import-dialog").showModal();
};
$("#import-form").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.target.querySelector(".submit");
  const file = e.target.elements.file.files[0];
  if (!file) return;
  button.disabled = true;
  $("#import-error").textContent = "";
  $("#import-status").textContent = t("dialogs.import.reading");
  try {
    const features = parseImport(await file.text());
    let created = 0,
      merged = 0,
      skipped = 0;
    const problems = [];
    for (let i = 0; i < features.length; i++) {
      let body;
      try {
        body = validateImportFeature(features[i], i);
      } catch (error) {
        skipped++;
        if (problems.length < 3) problems.push(error.message);
        continue;
      }
      try {
        const result = await api("/reports", body);
        if (result.merged) merged++;
        else created++;
      } catch (error) {
        skipped++;
        if (problems.length < 3)
          problems.push(`Feature ${i + 1}: ${error.message}`);
      }
      $("#import-status").textContent = t("dialogs.import.importing", {
        i: i + 1,
        n: features.length,
      });
    }
    $("#import-dialog").close();
    e.target.reset();
    const parts = [];
    if (created) parts.push(t("toasts.importAdded", { n: created }));
    if (merged) parts.push(t("toasts.importMerged", { n: merged }));
    if (skipped) parts.push(t("toasts.importSkipped", { n: skipped }));
    toast(
      t("toasts.importFinished", {
        parts: parts.join(", ") || t("toasts.importNothing"),
      }) +
        (problems.length
          ? " " + t("toasts.importIssues", { issues: problems.join(" ") })
          : ""),
    );
    await refresh();
  } catch (error) {
    $("#import-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$("#major-only").onchange = (e) => {
  majorOnly = e.target.checked;
  render();
};
$("#hide-demo").onchange = (e) => {
  hideDemo = e.target.checked;
  render();
};
$("#sort").onchange = (e) => {
  sort = e.target.value;
  render();
};
$("#search").addEventListener("input", (e) => {
  query = e.target.value.toLowerCase();
  render();
});
for (const [selector, value] of [
  ["#active-tab", "active"],
  ["#resolved-tab", "resolved"],
])
  $(selector).onclick = () => {
    status = value;
    selected = null;
    lastDetailKey = null;
    $("#detail").hidden = true;
    $("#active-tab").classList.toggle("selected", value === "active");
    $("#resolved-tab").classList.toggle("selected", value === "resolved");
    render();
  };
$("#detail").onclick = async (e) => {
  if (e.target.closest("#save-report")) {
    const removing = saved.has(selected);
    if (removing) saved.delete(selected);
    else saved.add(selected);
    try {
      localStorage.setItem("friction-saved", JSON.stringify([...saved]));
    } catch {
      toast(t("toasts.storageUnavailable"));
    }
    render();
    return;
  }
  if (e.target.closest("#share-report")) {
    try {
      await navigator.clipboard.writeText(location.href);
      toast(t("toasts.linkCopied"));
    } catch {
      toast(t("toasts.copyManually"));
    }
    return;
  }
  if (e.target.closest("#follow-report")) {
    const r = reports.find((x) => x.id === selected);
    if (followed.has(selected)) {
      followed.delete(selected);
      delete seen[selected];
      toast(t("toasts.unfollowed"));
    } else {
      followed.add(selected);
      seen[selected] = snapshotReports(r ? [r] : [])[selected];
      toast(t("toasts.following"));
    }
    writeIdSet(localStorage, "friction-followed", followed);
    writeSnapshot(localStorage, seen);
    lastDetailKey = null;
    render();
    return;
  }
  if (e.target.closest("#flag-report")) {
    $("#flag-error").textContent = "";
    $("#flag-form").reset();
    $("#flag-dialog").showModal();
    return;
  }
  if (e.target.closest("#kudos-report")) {
    toggleKudos(selected);
    return;
  }
  if (e.target.closest("#close-detail")) {
    closeDetail();
    return;
  }
  const react = e.target.closest("[data-react]");
  if (react) {
    react.disabled = true;
    try {
      const result = await api(`/comments/${react.dataset.react}/react`);
      react.innerHTML = helpfulLabel(result.helpfulCount);
      react.setAttribute("aria-pressed", String(result.helpful));
    } catch (error) {
      toast(error.message);
      react.disabled = false;
    }
    return;
  }
  const replyBtn = e.target.closest("[data-reply]");
  if (replyBtn) {
    const card = replyBtn.closest(".comment");
    const existing = card.querySelector(".reply-form");
    if (existing) {
      existing.remove();
      return;
    }
    card.insertAdjacentHTML(
      "beforeend",
      `<form class="reply-form"><input name="note" maxlength="300" placeholder="${t("detail.replyPlaceholder")}" aria-label="${t("detail.replyAria")}" autocomplete="off"><button type="submit">${t("detail.replySubmit")}</button></form><p class="comment-error" role="alert"></p>`,
    );
    card.querySelector(".reply-form input").focus();
    return;
  }
  const b = e.target.closest("[data-vote]");
  if (!b) return;
  b.disabled = true;
  try {
    await api(`/reports/${selected}/vote`, { action: b.dataset.vote });
    toast(
      b.dataset.vote === "clear"
        ? t("toasts.voteClear")
        : t("toasts.voteConfirm"),
    );
    await refresh();
  } catch (error) {
    toast(error.message);
    b.disabled = false;
  }
};
$("#detail").addEventListener("submit", async (e) => {
  const isReply = e.target.classList.contains("reply-form");
  if (e.target.id !== "comment-form" && !isReply) return;
  e.preventDefault();
  const input = e.target.elements.note;
  const button = e.target.querySelector("button");
  const text = input.value.trim();
  if (!text || !selected) return;
  button.disabled = true;
  const errorEl = isReply
    ? e.target.parentElement.querySelector(".comment-error")
    : $("#comment-error");
  if (errorEl) errorEl.textContent = "";
  try {
    const parentId = isReply
      ? e.target.closest(".comment").dataset.comment
      : null;
    const comment = await api(
      `/reports/${selected}/comments`,
      parentId ? { body: text, parentId } : { body: text },
    );
    input.value = "";
    if (isReply) {
      const card = e.target.closest(".comment");
      let replies = card.querySelector(".replies");
      if (!replies) {
        card.insertAdjacentHTML("beforeend", '<div class="replies"></div>');
        replies = card.querySelector(".replies");
      }
      replies.insertAdjacentHTML("beforeend", replyHtml(comment));
      e.target.remove();
    } else {
      const list = $("#comment-list");
      if (list) {
        const empty = list.querySelector(".comments-empty");
        if (empty) empty.remove();
        list.insertAdjacentHTML("beforeend", commentHtml(comment));
      }
    }
    const r = reports.find((x) => x.id === selected);
    if (r) {
      r.commentCount = (r.commentCount || 0) + 1;
      seen = snapshotReports(reports);
      writeSnapshot(localStorage, seen);
      lastDetailKey = null;
      render();
    }
    toast(t(isReply ? "toasts.replyPosted" : "toasts.notePosted"));
  } catch (error) {
    if (errorEl) errorEl.textContent = error.message;
    else toast(error.message);
  } finally {
    button.disabled = false;
  }
});
function openReport() {
  const form = $("#report-form");
  form.elements.lat.value = chosen.lat.toFixed(6);
  form.elements.lng.value = chosen.lng.toFixed(6);
  $("#form-error").textContent = "";
  // Fresh state for the photo attachment and duplicate preview.
  pendingPhoto = null;
  $("#photo-file").value = "";
  $("#photo-preview").hidden = true;
  $("#photo-preview img").removeAttribute("src");
  $("#similar-box").hidden = true;
  $("#similar-box").innerHTML = "";
  $("#report-dialog").showModal();
  refreshSimilar();
}
// ---- Photo attachments: compressed on-device, previewed, sent as data URL ----
$("#photo-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pendingPhoto = await compressPhoto(file);
  } catch {
    pendingPhoto = null;
    $("#photo-file").value = "";
    return toast(t("photo.tooLarge"));
  }
  if (pendingPhoto.length > 350 * 1024) {
    pendingPhoto = null;
    $("#photo-file").value = "";
    return toast(t("photo.tooLarge"));
  }
  $("#photo-preview img").src = pendingPhoto;
  $("#photo-preview").hidden = false;
});
$("#photo-remove").onclick = () => {
  pendingPhoto = null;
  $("#photo-file").value = "";
  $("#photo-preview").hidden = true;
  $("#photo-preview img").removeAttribute("src");
};
// ---- Duplicate preview: "is this already reported?" before filing ----
let similarTimer = null;
async function refreshSimilar() {
  const box = $("#similar-box");
  const form = $("#report-form");
  if (!form || !box) return;
  const lat = Number(form.elements.lat.value);
  const lng = Number(form.elements.lng.value);
  const category = form.elements.category.value;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !category) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  try {
    const cands = await api(
      `/reports/similar?lat=${lat}&lng=${lng}&category=${encodeURIComponent(category)}&city=${city.id}`,
    );
    if (!cands.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML =
      `<strong>${t("similar.title")}</strong><p>${t("similar.hint")}</p>` +
      cands
        .map(
          (r) =>
            `<div class="similar-row"><div><strong>${escape(r.title)}</strong><span>${escape(r.location)} · ${t("similar.distance", { m: r.distanceM })} · ♧ ${r.confirmations}</span></div><button type="button" data-similar-confirm="${r.id}">${t("similar.confirmInstead")}</button></div>`,
        )
        .join("");
  } catch {
    box.hidden = true;
    box.innerHTML = "";
  }
}
$("#report-form").addEventListener("input", () => {
  clearTimeout(similarTimer);
  similarTimer = setTimeout(refreshSimilar, 500);
});
$("#report-dialog").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-similar-confirm]");
  if (!btn) return;
  btn.disabled = true;
  try {
    await api(`/reports/${btn.dataset.similarConfirm}/vote`, {
      action: "confirm",
    });
    $("#report-dialog").close();
    $("#report-form").reset();
    pendingPhoto = null;
    await refresh();
    select(btn.dataset.similarConfirm);
    toast(t("similar.confirmedThanks"));
  } catch (error) {
    toast(error.message);
    btn.disabled = false;
  }
});
$("#report").onclick = openReport;
$("#report-bottom").onclick = openReport;
map.on("click", (e) => {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (drawMode) return; // draw mode works through drag events, not clicks
  if (tripMode) {
    tripClick(e.latlng);
    return;
  }
  if (alertMode) {
    alertAnchor = e.latlng;
    $("#alert-error").textContent = "";
    $("#alert-form").reset();
    $("#alert-dialog").showModal();
    return;
  }
  chosen = e.latlng;
  if (pin) map.removeLayer(pin);
  pin = L.circleMarker(chosen, { radius: 8, color: "#174f40" }).addTo(map);
  toast(t("toasts.locationSelected"));
});
$("#report-form").onsubmit = async (e) => {
  e.preventDefault();
  const button = $(".submit");
  button.disabled = true;
  const body = Object.fromEntries(new FormData(e.target));
  ["lat", "lng", "severity"].forEach((k) => (body[k] = Number(body[k])));
  body.city = city.id;
  if (pendingPhoto) body.photo = pendingPhoto;
  // Offline: queue the report locally and sync it when the connection returns.
  if (!isOnline()) {
    try {
      await queueReport(body);
    } catch {
      $("#form-error").textContent = t("toasts.queueFailed");
      button.disabled = false;
      return;
    }
    $("#report-dialog").close();
    e.target.reset();
    pendingPhoto = null;
    $("#photo-preview").hidden = true;
    updateOfflinePill();
    toast(t("toasts.queuedOffline"));
    button.disabled = false;
    return;
  }
  try {
    const result = await api("/reports", body);
    $("#report-dialog").close();
    e.target.reset();
    pendingPhoto = null;
    $("#photo-preview").hidden = true;
    status = "active";
    majorOnly = false;
    hideDemo = false;
    savedOnly = false;
    $("#major-only").checked = false;
    $("#hide-demo").checked = false;
    $("#saved-toggle").setAttribute("aria-pressed", "false");
    category = "all";
    query = "";
    $("#search").value = "";
    $("#active-tab").classList.add("selected");
    $("#resolved-tab").classList.remove("selected");
    document
      .querySelectorAll(".chip")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.category === "all"),
      );
    await refresh();
    select(result.report.id);
    toast(result.merged ? t("toasts.reportMerged") : t("toasts.reportPosted"));
  } catch (error) {
    $("#form-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$("#flag-form").onsubmit = async (e) => {
  e.preventDefault();
  const reason = new FormData(e.target).get("reason");
  const button = e.target.querySelector(".submit");
  button.disabled = true;
  $("#flag-error").textContent = "";
  try {
    const result = await api(`/reports/${selected}/flag`, { reason });
    $("#flag-dialog").close();
    toast(
      result.hidden
        ? t("toasts.flagHidden")
        : t("toasts.flagCount", { n: result.flagCount }),
    );
    await refresh();
  } catch (error) {
    $("#flag-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$("#about").onclick = () => $("#about-dialog").showModal();
// ---- Moderation queue: flagged reports, gated by the admin token ----
async function adminApi(path, body, method = "GET") {
  const token = sessionStorage.getItem("friction-admin-token") || "";
  const response = await fetch("/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Visitor-Id": visitor,
      "X-Admin-Token": token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function renderModerationList(items) {
  const list = $("#moderation-list");
  if (!items.length) {
    list.innerHTML = `<p class="comments-empty">${t("moderation.empty")}</p>`;
    return;
  }
  list.innerHTML = items
    .map((r) => {
      const c = categories[r.category] || { label: r.category, icon: "•" };
      const reasons = Object.entries(r.flagReasons || {})
        .map(
          ([reason, n]) =>
            `<span class="flag-reason">${escape(reason)} ×${n}</span>`,
        )
        .join("");
      return `<div class="mod-row" data-mod="${r.id}"><div><strong>${c.icon} ${escape(r.title)}</strong><span class="mod-meta">${escape(r.location)} · ${t("moderation.flags", { n: r.flagCount })}${r.hidden ? ` · ${t("moderation.isHidden")}` : ""}</span><div class="flag-reasons">${reasons}</div></div><div class="mod-actions"><button data-mod-act="hide" ${r.hidden ? "disabled" : ""}>${t("moderation.hide")}</button><button data-mod-act="restore" ${r.hidden ? "" : "disabled"}>${t("moderation.restore")}</button><button data-mod-act="delete" class="danger">${t("moderation.delete")}</button></div></div>`;
    })
    .join("");
}
async function loadModerationQueue() {
  const errorEl = $("#moderation-error");
  errorEl.textContent = "";
  try {
    const items = await adminApi("/moderation/flags");
    $("#moderation-auth").hidden = true;
    $("#moderation-list").hidden = false;
    renderModerationList(items);
  } catch (error) {
    errorEl.textContent = error.message;
    $("#moderation-auth").hidden = false;
    $("#moderation-list").hidden = true;
  }
}
$("#moderation").onclick = () => {
  const hasToken = !!sessionStorage.getItem("friction-admin-token");
  $("#moderation-auth").hidden = hasToken;
  $("#moderation-list").hidden = !hasToken;
  $("#moderation-error").textContent = "";
  if (hasToken) loadModerationQueue();
  else {
    $("#moderation-token").value = "";
    renderModerationList([]);
  }
  $("#moderation-dialog").showModal();
};
$("#moderation-unlock").onclick = async () => {
  const token = $("#moderation-token").value.trim();
  if (!token) {
    $("#moderation-error").textContent = t("moderation.needToken");
    return;
  }
  sessionStorage.setItem("friction-admin-token", token);
  await loadModerationQueue();
};
$("#moderation-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-mod-act]");
  if (!btn || btn.disabled) return;
  const row = btn.closest("[data-mod]");
  const id = row.dataset.mod;
  const action = btn.dataset.modAct;
  if (action === "delete" && !confirm(t("moderation.confirmDelete"))) return;
  btn.disabled = true;
  try {
    const result = await adminApi(
      `/reports/${id}/moderate`,
      { action },
      "POST",
    );
    if (result.deleted) {
      reports = reports.filter((r) => r.id !== id);
      if (selected === id) closeDetail();
    } else {
      const r = reports.find((x) => x.id === id);
      if (r) r.hidden = result.hidden;
    }
    render();
    toast(
      result.deleted
        ? t("moderation.deleted")
        : result.hidden
          ? t("moderation.hidden")
          : t("moderation.restored"),
    );
    await loadModerationQueue();
  } catch (error) {
    toast(error.message);
    btn.disabled = false;
  }
});
document
  .querySelectorAll("dialog .close")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
$("#locate").onclick = () => {
  if (!navigator.geolocation) return toast(t("toasts.geoUnavailable"));
  navigator.geolocation.getCurrentPosition(
    (p) => {
      chosen = { lat: p.coords.latitude, lng: p.coords.longitude };
      map.setView(chosen, 15);
      toast(t("toasts.centeredHome"));
    },
    () => toast(t("toasts.locationUnavailable")),
  );
};
// ---- Notification center: bell, unread badge, and cross-city navigation ----
async function openNotificationReport(reportId, noteCity) {
  if (noteCity && noteCity !== city.id && cities.some((c) => c.id === noteCity))
    await switchCity(noteCity);
  let r = reports.find((x) => x.id === reportId);
  if (!r) {
    try {
      r = await api(`/reports/${reportId}`);
      if (r && !r.hidden) reports.unshift(r);
    } catch {
      r = null;
    }
  }
  if (!r) return toast(t("toasts.reportNotFound"));
  status = r.status;
  $("#active-tab").classList.toggle("selected", status === "active");
  $("#resolved-tab").classList.toggle("selected", status === "resolved");
  render();
  select(r.id);
}
initNotifications({
  api,
  mount: $("#notify-slot"),
  onOpenReport: openNotificationReport,
});
// ---- Offline queue: sync at startup and whenever the connection returns ----
async function updateOfflinePill() {
  const pill = $("#offline-pill");
  const n = await pendingCount().catch(() => 0);
  if (!isOnline() || n > 0) {
    pill.hidden = false;
    pill.textContent = !isOnline()
      ? t("toasts.offlineBadge", { n })
      : t("toasts.queuedBadge", { n });
  } else {
    pill.hidden = true;
  }
}
async function syncNow() {
  const { synced } = await syncPending((data) => api("/reports", data)).catch(
    () => ({ synced: 0 }),
  );
  await updateOfflinePill();
  if (synced > 0) {
    toast(t("toasts.syncedOffline", { n: synced }));
    await refresh();
  }
}
onOnline(() => syncNow());
window.addEventListener("offline", () => updateOfflinePill());
// ---- Theme + language controls ----
function renderThemeToggle() {
  $("#theme-toggle").textContent =
    document.documentElement.dataset.theme === DARK ? "☀️" : "🌙";
}
$("#theme-toggle").onclick = () => {
  toggleTheme();
  renderThemeToggle();
};
renderThemeToggle();
$("#lang-select").onchange = (e) => {
  setLang(e.target.value);
  // Rebuild the UI in the new language; city and filters persist.
  location.reload();
};
loadCities();
syncNow();
refresh();
setInterval(refresh, 15000);
