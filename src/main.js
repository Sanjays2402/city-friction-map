import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { categories } from "../server/domain.js";
import { corridorReports, clampWidth } from "./tripcheck.js";
import { toGeoJSON, parseImport, validateImportFeature } from "./geojson.js";
import { isTypingTarget, shortcutFor } from "./shortcuts.js";
import { weatherLabel, dockColor, caseColor } from "./enrich.js";

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
let initialReport = new URL(location.href).searchParams.get("report");
let lastDetailKey = null,
  commentsFor = null;
$("#app").innerHTML = `
<header><a class="brand" href="/" aria-label="City Friction home"><span class="brand-icon">↗</span> city<span>friction</span><sup>SF</sup></a><nav><span class="nav-active">Explore the city</span><button id="about">How it works ↗</button></nav><button class="primary" id="report">＋ Report friction</button></header>
<main><section class="intro"><div><div class="eyebrow">A LITTLE LOCAL KNOWLEDGE GOES A LONG WAY</div><h1>Less friction.<br class="mobile-break"> More city.</h1><p>The little things between you and a good day. See them coming.</p></div><div class="city"><span class="pulse"></span> San Francisco <small>Community map · Demo enabled</small><span id="weather-pill" class="weather-pill" hidden></span></div></section>
<section class="toolbar" aria-label="Map filters"><label class="search"><span>⌕</span><input id="search" placeholder="Search a place or a problem…" aria-label="Search reports"></label><div id="filters" class="filters"><button class="chip active" data-category="all">All friction</button>${Object.entries(
  categories,
)
  .map(
    ([k, c]) =>
      `<button class="chip" data-category="${k}"><span style="color:${c.color}">${c.icon}</span> ${c.label}</button>`,
  )
  .join("")}</div></section>
<section class="workspace"><aside><div class="list-header"><div><h2>Around the neighborhood</h2><p id="count">Loading reports…</p></div><span class="live">● LIVE</span></div><div class="tabs"><button id="active-tab" class="selected">Happening now</button><button id="resolved-tab">Cleared</button></div><div id="list" aria-live="polite"></div><div class="aside-footer">↗ Small updates. Smoother days.</div></aside><div class="map-wrap"><div id="map" aria-label="Map of San Francisco friction reports"></div><div class="map-note"><span class="pulse"></span> The city, with a little more context.</div><div id="heat-controls" class="heat-controls" hidden><label>Heat window <select id="heat-window" aria-label="Heatmap time window"><option value="0">All time</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option></select></label></div><button id="locate" title="Show my location" aria-label="Show my location">⌖</button><div id="detail" hidden></div><div class="map-legend"><span>●</span> Community reported <i></i> Estimates, not guarantees</div></div></section>
<section class="bottom"><div><span class="leaf">✳</span><div><strong>Your two-second update could save someone twenty minutes.</strong><p>Spotted something? Put it on the map.</p></div></div><button id="report-bottom">Share a heads-up ↗</button></section><footer><span>Built for the everyday in-between.</span><span id="updated">Connecting…</span></footer></main>
<dialog id="report-dialog"><form id="report-form"><div class="dialog-head"><div class="eyebrow">GOOD NEIGHBORS LEAVE A HEADS-UP</div><button type="button" class="close" aria-label="Close report form">×</button></div><h2>What’s slowing things down?</h2><p>Choose a spot on the map first, or enter its coordinates below.</p><label>Type of friction<select name="category">${Object.entries(
  categories,
)
  .map(([k, c]) => `<option value="${k}">${c.label}</option>`)
  .join(
    "",
  )}</select></label><label>Short headline<input name="title" required minlength="3" maxlength="100" placeholder="e.g. Sidewalk blocked by roadwork"></label><label>Place or intersection<input name="location" required minlength="3" maxlength="100" placeholder="e.g. Market & 8th Street"></label><div class="form-row"><label>Latitude<input name="lat" type="number" step="any" min="37.70" max="37.84" required></label><label>Longitude<input name="lng" type="number" step="any" min="-122.53" max="-122.35" required></label></div><label>Impact<select name="severity"><option value="1">Minor · a little inconvenient</option><option value="2" selected>Moderate · plan around it</option><option value="3">Major · significant obstacle</option></select></label><label>Anything useful to know?<textarea name="description" maxlength="500" rows="3" placeholder="What would you tell a friend walking this way?"></textarea></label><label>Photo URL <span class="optional-note">(optional)</span><input name="photoUrl" type="url" maxlength="500" placeholder="https://… a photo of the obstacle"></label><p class="form-note">Similar reports within 90 meters may be merged. Reports are visible to everyone using this server.</p><p id="form-error" role="alert"></p><button class="primary submit" type="submit">Put it on the map ↗</button></form></dialog>
<dialog id="about-dialog"><button class="close" aria-label="Close explanation">×</button><div class="eyebrow">A SHARED PICTURE OF YOUR CITY</div><h2>Little reports. Real usefulness.</h2><p>Report an obstacle, confirm it’s still there, or tell your neighbors it has cleared. Two independent browser clearance votes resolve an issue.</p><h3>How estimates work</h3><p>Time ranges use category and impact, measured from the latest confirmation. They’re heuristic estimates, not trained forecasts. More confirmations improve the evidence label, but confidence is never a statistical probability.</p><h3>An honest starting point</h3><p>Initial San Francisco reports are fictional and labeled DEMO. New reports are saved in SQLite and shared across connected browsers. Updates refresh every 15 seconds. Anonymous browser IDs prevent casual repeated votes, but are not identity verification.</p><h3>Keyboard shortcuts</h3><p><kbd>/</kbd> search · <kbd>?</kbd> this guide · <kbd>f</kbd> followed filter · <kbd>Esc</kbd> close dialogs and panels</p></dialog><dialog id="flag-dialog"><form id="flag-form"><div class="dialog-head"><div class="eyebrow">KEEP THE MAP HONEST</div><button type="button" class="close" aria-label="Close flag form">×</button></div><h2>Why flag this report?</h2><p>Three flags from different neighbors hide a report pending review. Flagging is anonymous.</p><div class="flag-reasons"><label><input type="radio" name="reason" value="spam" required> Spam or advertising</label><label><input type="radio" name="reason" value="inaccurate"> Inaccurate or outdated</label><label><input type="radio" name="reason" value="inappropriate"> Inappropriate content</label><label><input type="radio" name="reason" value="duplicate"> Duplicate report</label></div><p id="flag-error" role="alert"></p><button class="primary submit" type="submit">Flag this report</button></form></dialog><dialog id="alert-dialog"><form id="alert-form"><div class="dialog-head"><div class="eyebrow">NEVER MISS FRICTION AGAIN</div><button type="button" class="close" aria-label="Close alert form">×</button></div><h2>Watch this area</h2><p>Get a heads-up when new friction appears inside the zone.</p><label>Zone name<input name="label" required minlength="1" maxlength="60" placeholder="e.g. My walk to work"></label><label>Radius<select name="radiusM"><option value="100">100 m</option><option value="250" selected>250 m</option><option value="500">500 m</option><option value="1000">1 km</option><option value="2500">2.5 km</option><option value="5000">5 km</option></select></label><p id="alert-error" role="alert"></p><button class="primary submit" type="submit">Watch this area</button></form></dialog><dialog id="leaders-dialog"><button class="close" aria-label="Close top neighbors">×</button><div class="eyebrow">THANK YOUR NEIGHBORS</div><h2>Top neighbors</h2><div id="leaders-list"><p class="comments-empty">Loading…</p></div></dialog><dialog id="trends-dialog"><button class="close" aria-label="Close trends">×</button><div class="eyebrow">THE CITY, IN NUMBERS</div><h2>Friction trends</h2><p>New reports per day for the last 14 days, by category.</p><canvas id="trends-chart" width="640" height="300" aria-label="Bar chart of new reports per day"></canvas><div id="trends-legend" class="trends-legend"></div><div id="trends-stats" class="trends-stats"></div></dialog><dialog id="import-dialog"><form id="import-form"><div class="dialog-head"><div class="eyebrow">BRING YOUR OWN DATA</div><button type="button" class="close" aria-label="Close import form">×</button></div><h2>Import GeoJSON</h2><p>Choose a GeoJSON FeatureCollection of Point features. Each valid feature becomes a report; similar ones merge into existing reports.</p><label>GeoJSON file<input name="file" type="file" accept=".geojson,.json,application/json" required></label><p id="import-error" role="alert"></p><p id="import-status" role="status"></p><button class="primary submit" type="submit">Import reports</button></form></dialog><div id="toast" role="status"></div>`;
$(".toolbar").insertAdjacentHTML(
  "beforebegin",
  '<section id="summary" class="summary" aria-label="City overview"></section>',
);
$(".toolbar").insertAdjacentHTML(
  "afterend",
  `<section class="discovery-controls" aria-label="Report preferences"><div><button id="saved-toggle" class="preference" aria-pressed="false">☆ Saved reports <span id="saved-count">0</span></button><button id="followed-toggle" class="preference" aria-pressed="false">🔔 Followed <span id="followed-count">0</span></button><button id="alerts-toggle" class="preference" aria-pressed="false">⚐ Alert zones</button><button id="draw-toggle" class="preference" aria-pressed="false">◯ Draw zone</button><button id="trip-toggle" class="preference" aria-pressed="false">🛣 Trip check</button><button id="heat-toggle" class="preference" aria-pressed="false">🔥 Heatmap</button><button id="bikes-toggle" class="preference" aria-pressed="false">🚲 Bike docks</button><button id="cases-toggle" class="preference" aria-pressed="false">📋 311 cases</button><button id="leaders" class="preference">🏆 Top neighbors</button><button id="trends" class="preference">📊 Trends</button><label><input id="major-only" type="checkbox"> Major impact only</label><label><input id="hide-demo" type="checkbox"> Hide demo reports</label><button id="export-csv" class="preference">⭳ Export CSV</button><button id="export-geojson" class="preference">⭳ GeoJSON</button><button id="import-geojson" class="preference">⭳ Import</button></div><label class="sort-label">Sort by <select id="sort"><option value="recent">Latest update</option><option value="impact">Highest impact</option><option value="confirmed">Most confirmed</option></select></label></section>`,
);
$(".discovery-controls").insertAdjacentHTML(
  "afterend",
  `<section id="alerts-panel" class="alerts-panel" hidden aria-label="Your alert zones"></section><section id="trip-panel" class="trip-panel" hidden aria-label="Trip check"></section>`,
);
const map = L.map("map", { zoomControl: false }).setView(
  [37.775, -122.421],
  14,
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
    `<div><span class="summary-symbol">◉</span><strong>${stats.active}</strong><span>Active heads-ups</span></div><div><span class="summary-symbol red">↗</span><strong>${stats.major}</strong><span>Major obstacles</span></div><div><span class="summary-symbol amber">◷</span><strong>${stats.stale}</strong><span>Need a fresh update</span></div><div><span class="summary-symbol">✓</span><strong>${stats.resolved}</strong><span>Community cleared</span></div><small>Citywide · ${hideDemo ? "community reports only" : "includes demo data"}</small>`;
  $("#saved-count").textContent = reports.filter((r) => saved.has(r.id)).length;
  $("#followed-count").textContent = followed.size;
  $(".city small").textContent = reports.some((r) => r.demo)
    ? "Community map · Includes demo data"
    : "Community map · Shared reports";
  const rows = visible();
  $("#count").textContent =
    `${rows.length} ${status === "active" ? "active heads-ups" : "cleared reports"} · all mapped areas`;
  const emptyIcon = savedOnly ? "☆" : followedOnly ? "🔔" : "☀";
  const emptyTitle = savedOnly
    ? "Keep useful updates close."
    : followedOnly
      ? "Nothing you're following here."
      : "A little breathing room.";
  const emptyHint = savedOnly
    ? "Open any report and save it to find it here."
    : followedOnly
      ? "Follow a report to get notified when neighbors update it."
      : "No reports match these filters.";
  $("#list").innerHTML = rows.length
    ? rows
        .map((r) => {
          const c = categories[r.category];
          return `<button class="report-card ${selected === r.id ? "chosen" : ""}" data-id="${r.id}"><div class="card-top"><span class="category-icon" style="--accent:${c.color}">${c.icon}</span><span class="category-label">${c.label}</span>${r.demo ? '<span class="demo">DEMO</span>' : ""}${unseen.has(r.id) ? '<span class="unseen-dot" title="New updates on a report you follow">●</span>' : ""}<span class="age">${age(r.updatedAt)}</span></div><h3>${escape(r.title)}</h3><p class="place">${escape(r.location)}</p><div class="card-bottom"><span class="estimate">${r.status === "resolved" ? "✓ Cleared" : `◷ ${escape(r.prediction.label)}`}</span><span>♧ ${r.confirmations} confirmations</span>${r.commentCount ? `<span>💬 ${r.commentCount}</span>` : ""}${r.photoUrl ? `<span title="Has a photo">📷</span>` : ""}</div></button>`;
        })
        .join("")
    : `<div class="empty"><span>${emptyIcon}</span><h3>${emptyTitle}</h3><p>${emptyHint}</p><button id="reset-filters">Reset filters</button></div>`;
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
      ? `${r.updatedAt}:${r.commentCount || 0}:${r.status}:${r.clearVotes}:${r.confirmations}:${r.hidden ? 1 : 0}:${r.flagCount || 0}`
      : "gone";
    if (key !== lastDetailKey) {
      lastDetailKey = key;
      renderDetail();
    }
  }
  if (heatLayer) heatLayer.setLatLngs(heatPoints());
  if (tripMode) renderTripPanel();
  $("#updated").textContent = lastUpdated
    ? `Updated ${age(lastUpdated)} · refreshes every 15s`
    : "Connecting…";
}
function select(id) {
  selected = id;
  lastDetailKey = null;
  if (unseen.delete(id)) writeIdSet(localStorage, "friction-unseen", unseen);
  const r = reports.find((x) => x.id === id);
  const url = new URL(location.href);
  url.searchParams.set("report", id);
  history.replaceState(null, "", url);
  map.flyTo([r.lat, r.lng], 15, { duration: 0.5 });
  render();
}
function closeDetail() {
  selected = null;
  lastDetailKey = null;
  const url = new URL(location.href);
  url.searchParams.delete("report");
  history.replaceState(null, "", url);
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
      ? ` · ⚑ ${r.flagCount} flag${r.flagCount === 1 ? "" : "s"}`
      : "";
  const snippet = note && note.length > 140 ? note.slice(0, 140) + "…" : note;
  return `<div class="marker-popup"><div class="popup-title">${escape(r.title)}</div><div class="popup-meta">${c.icon} ${c.label} · ♧ ${r.confirmations}${flags}</div>${r.photoUrl ? `<img src="${escape(r.photoUrl)}" alt="Photo attached to this report" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${snippet ? `<p class="popup-note">💬 ${escape(snippet)}</p>` : ""}</div>`;
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
  return `👍 Helpful${count ? ` (${count})` : ""}`;
}
function commentHtml(c) {
  return `<div class="comment" data-comment="${c.id}"><div class="comment-meta"><strong>${escape(c.author)}</strong><span>${age(c.createdAt)}</span></div><p>${escape(c.body)}</p><div class="comment-actions"><button class="helpful" data-react="${c.id}" aria-pressed="false">${helpfulLabel(c.helpfulCount)}</button><button data-reply="${c.id}">↩ Reply</button></div>${c.replies && c.replies.length ? `<div class="replies">${c.replies.map(replyHtml).join("")}</div>` : ""}</div>`;
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
      : `<p class="comments-empty">No notes yet. Passed by here? Leave one for the next person.</p>`;
  } catch {
    if (commentsFor === id && $("#comment-list"))
      $("#comment-list").innerHTML =
        `<p class="comments-empty">Could not load notes.</p>`;
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
  $("#detail").innerHTML =
    `<button class="close" id="close-detail" aria-label="Close report details">×</button><div class="eyebrow" style="color:${c.color}">${c.label}${r.demo ? " · FICTIONAL DEMO" : ""}</div><h2>${escape(r.title)}</h2><p class="place">${escape(r.location)}</p>${r.photoUrl ? `<a class="report-photo" href="${escape(r.photoUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escape(r.photoUrl)}" alt="Photo attached to this report" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.report-photo').remove()"></a>` : ""}<p>${escape(r.description)}</p>${r.hidden ? '<p class="hidden-notice">⚑ Hidden after community flags. Under review.</p>' : ""}<div class="prediction"><span>Estimated time to clear<strong>${r.status === "resolved" ? "Cleared" : escape(r.prediction.label)}</strong></span><span class="confidence">${r.prediction.confidence} confidence</span></div><p class="detail-note">Category-based estimate · ${r.confirmations} confirmations · ${r.clearVotes}/2 clearance votes</p>${r.hidden ? "" : r.status === "active" ? '<div class="detail-actions"><button class="primary" data-vote="confirm">Still here +1</button><button data-vote="clear">✓ Looks clear</button></div>' : "<p>✓ The community marked this cleared.</p>"}`;
  $("#detail").insertAdjacentHTML(
    "beforeend",
    `<div class="report-tools"><button id="save-report" aria-pressed="${saved.has(r.id)}">${saved.has(r.id) ? "★ Saved" : "☆ Save report"}</button><button id="follow-report" aria-pressed="${followed.has(r.id)}">${followed.has(r.id) ? "🔔 Following" : "🔔 Follow updates"}</button><button id="flag-report">⚑ Flag</button><button id="share-report">Copy report link ↗</button></div><div class="impact-line">${["", "Minor inconvenience", "Moderate impact", "Major obstacle"][r.severity]} · First reported ${age(r.createdAt)}</div><div class="comments"><h3>Neighbor notes</h3><div id="comment-list"><p class="comments-empty">Loading notes…</p></div><form id="comment-form"><input name="note" maxlength="300" placeholder="Add a useful note for neighbors…" aria-label="Add a neighbor note" autocomplete="off"><button type="submit">Post</button></form><p id="comment-error" role="alert"></p></div>`,
  );
  loadComments(r.id);
}
async function refresh() {
  try {
    const next = await api("/reports");
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
        `🔔 ${updates.length === 1 ? "An update" : `${updates.length} updates`} on followed reports — ${preview}${updates.length > 2 ? "…" : ""}`,
      );
    }
    seen = snapshotReports(next);
    writeSnapshot(localStorage, seen);
    await refreshAlerts();
    if (initialReport) {
      const target = reports.find((r) => r.id === initialReport);
      initialReport = null;
      if (target) {
        status = target.status;
        $("#active-tab").classList.toggle("selected", status === "active");
        $("#resolved-tab").classList.toggle("selected", status === "resolved");
        select(target.id);
      } else toast("This shared report could not be found on this server.");
    }
    render();
  } catch (e) {
    $("#count").textContent = "Could not load reports.";
    $("#updated").textContent = "Connection lost · retrying automatically";
    toast(e.message);
  }
}
$("#list").addEventListener("click", (e) => {
  if (e.target.closest("#reset-filters")) {
    resetFilters();
    return;
  }
  const card = e.target.closest("[data-id]");
  if (card) select(card.dataset.id);
});
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
  if (!rows.length) return toast("Nothing to export with these filters.");
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
    `Exported ${rows.length} report${rows.length === 1 ? "" : "s"} to CSV.`,
  );
};
$("#alerts-toggle").onclick = () => {
  alertMode = !alertMode;
  $("#alerts-toggle").setAttribute("aria-pressed", String(alertMode));
  toast(
    alertMode
      ? "Alert mode: click the map to watch an area."
      : "Alert mode off. Map clicks select a report location again.",
  );
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
    });
    $("#alert-dialog").close();
    form.reset();
    toast("Zone saved. We'll watch it for new friction.");
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
    `<h2>⚐ Your alert zones</h2>` +
    alertMatches
      .map(
        ({ zone, matches }) =>
          `<div class="alert-zone"><div><strong>${escape(zone.label)}</strong><span>${zone.radiusM >= 1000 ? `${zone.radiusM / 1000} km` : `${zone.radiusM} m`} radius</span></div><span class="alert-count">${matches.length} active nearby</span><button data-delete-zone="${zone.id}" aria-label="Delete alert zone ${escape(zone.label)}">×</button></div>`,
      )
      .join("");
}
$("#alerts-panel").addEventListener("click", async (e) => {
  const button = e.target.closest("[data-delete-zone]");
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/alerts/${button.dataset.deleteZone}`, undefined, "DELETE");
    toast("Alert zone removed.");
    await refreshAlerts();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});
$("#leaders").onclick = async () => {
  $("#leaders-list").innerHTML = `<p class="comments-empty">Loading…</p>`;
  $("#leaders-dialog").showModal();
  try {
    const leaders = await api("/contributors");
    const medals = ["🥇", "🥈", "🥉"];
    $("#leaders-list").innerHTML = leaders.length
      ? `<ol>${leaders
          .slice(0, 10)
          .map(
            (l, i) =>
              `<li><span class="medal">${medals[i] || `${i + 1}.`}</span><strong>${escape(l.name)}</strong><span class="leader-stats">${l.score} pts · ${l.reports} reports · ${l.notes} notes · ${l.confirmations} confirmations</span></li>`,
          )
          .join("")}</ol>`
      : `<p class="comments-empty">No contributions yet. Be the first to put one on the map!</p>`;
  } catch {
    $("#leaders-list").innerHTML =
      `<p class="comments-empty">Could not load the leaderboard.</p>`;
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
      .bindTooltip(`Stop ${i + 1} · drag to move`);
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
      ? "Click the map to drop route stops — two or more draw your route. Drag stops to fine-tune."
      : `${tripPath.length} stops · ${hits.length} friction report${hits.length === 1 ? "" : "s"} within ${tripWidthM} m of your route. Drag stops to adjust.`;
  panel.innerHTML =
    `<div class="trip-head"><h2>🛣 Trip check</h2><button id="trip-clear">Clear route</button></div>` +
    `<p>${hint}</p>` +
    `<label class="trip-width">Corridor width <input id="trip-width" type="range" min="50" max="2000" step="50" value="${tripWidthM}" aria-label="Corridor width in meters"> <strong>${tripWidthM} m</strong></label>` +
    (hits.length
      ? `<ul class="trip-hits">${hits
          .map(
            (r) =>
              `<li><button data-trip-report="${r.id}"><span class="trip-dist">${r.corridorM} m</span><span><strong>${escape(r.title)}</strong><small>${escape(r.location)}</small></span></button></li>`,
          )
          .join("")}</ul>`
      : tripPath.length >= 2
        ? `<p class="comments-empty">Clear corridor — nothing reported along this route.</p>`
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
  toast(
    tripMode
      ? "Trip check: click the map to drop route stops."
      : "Trip check off.",
  );
};
$("#heat-toggle").onclick = async () => {
  const on = !heatLayer;
  $("#heat-toggle").setAttribute("aria-pressed", String(on));
  if (on) {
    try {
      await heatReady;
    } catch {
      $("#heat-toggle").setAttribute("aria-pressed", "false");
      return toast("The heatmap could not load. Please try again.");
    }
    heatLayer = L.heatLayer(heatPoints(), {
      radius: 30,
      blur: 22,
      maxZoom: 16,
      minOpacity: 0.35,
    }).addTo(map);
    heatLayer.bringToBack();
    $("#heat-controls").hidden = false;
    toast("Heatmap on — brighter means more severe friction nearby.");
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
      ? "Heatmap: all reports."
      : `Heatmap: reports updated in the last ${heatHours === 24 ? "24 hours" : "7 days"}.`,
  );
};
function heatPoints() {
  const cutoff = heatHours ? Date.now() - heatHours * 3600 * 1000 : 0;
  return visible()
    .filter((r) => !r.hidden && r.updatedAt >= cutoff)
    .map((r) => [r.lat, r.lng, r.severity / 3]);
}
// ---- Live data enrichment layers: Bay Wheels docks, SF 311 cases, weather.
// Each layer is a toolbar toggle over a cached server proxy (/api/enrich/*).
// When an upstream is down the proxy answers { available: false } and the
// toggle quietly stands down instead of showing dead UI.
const bikeLayer = L.layerGroup().addTo(map);
const caseLayer = L.layerGroup().addTo(map);
let bikesOn = false,
  casesOn = false;
async function refreshWeather() {
  const pill = $("#weather-pill");
  try {
    const w = await api("/enrich/weather");
    if (!w.available) {
      pill.hidden = true;
      return;
    }
    pill.hidden = false;
    pill.textContent = `SF now: ${Math.round(w.tempC)}°C, ${weatherLabel(w.code)}`;
    pill.title = `Live San Francisco weather · wind ${Math.round(w.windKph)} km/h`;
  } catch {
    pill.hidden = true;
  }
}
refreshWeather();
setInterval(refreshWeather, 10 * 60 * 1000);
$("#bikes-toggle").onclick = async () => {
  bikesOn = !bikesOn;
  $("#bikes-toggle").setAttribute("aria-pressed", String(bikesOn));
  if (!bikesOn) {
    bikeLayer.clearLayers();
    return;
  }
  try {
    const data = await api("/enrich/bikeshare");
    if (!data.available || !bikesOn) throw new Error("unavailable");
    bikeLayer.clearLayers();
    for (const s of data.stations) {
      const color = dockColor(s);
      L.circleMarker([s.lat, s.lng], {
        radius: 5,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.65,
      })
        .bindTooltip(
          `<strong>${escape(s.name)}</strong><br>${s.bikes} bikes · ${s.docks} docks open${s.ebikes ? ` · ${s.ebikes} e-bikes` : ""}`,
        )
        .addTo(bikeLayer);
    }
    toast(
      `${data.stations.length} Bay Wheels stations — green has open docks, red is full.`,
    );
  } catch {
    bikesOn = false;
    $("#bikes-toggle").setAttribute("aria-pressed", "false");
    toast("Bike-share data is unavailable right now.");
  }
};
$("#cases-toggle").onclick = async () => {
  casesOn = !casesOn;
  $("#cases-toggle").setAttribute("aria-pressed", String(casesOn));
  if (!casesOn) {
    caseLayer.clearLayers();
    return;
  }
  try {
    const data = await api("/enrich/cases311");
    if (!data.available || !casesOn) throw new Error("unavailable");
    caseLayer.clearLayers();
    for (const c of data.cases) {
      const color = caseColor(c.status);
      L.circleMarker([c.lat, c.lng], {
        radius: 4,
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.55,
      })
        .bindTooltip(
          `<strong>${escape(c.type)}</strong><br>${escape(c.status)}${c.address ? `<br>${escape(c.address)}` : ""}`,
        )
        .addTo(caseLayer);
    }
    toast(`${data.cases.length} recent SF 311 cases on the map.`);
  } catch {
    casesOn = false;
    $("#cases-toggle").setAttribute("aria-pressed", "false");
    toast("311 case data is unavailable right now.");
  }
};
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
  toast(
    drawMode
      ? "Draw mode: press and drag on the map to size a zone. Esc cancels."
      : "Draw mode off.",
  );
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
    toast("Zone too small — drag a wider circle to watch an area.");
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
  $("#trends-stats").innerHTML = `<p class="comments-empty">Loading…</p>`;
  $("#trends-dialog").showModal();
  try {
    const trends = await api("/trends");
    drawTrends(trends.days);
    const t = trends.totals;
    $("#trends-stats").innerHTML =
      `<div><strong>${t.active}</strong><span>Active</span></div>` +
      `<div><strong>${t.resolved}</strong><span>Cleared</span></div>` +
      `<div><strong>${t.notes}</strong><span>Neighbor notes</span></div>` +
      `<div><strong>${t.confirmations}</strong><span>Confirmations</span></div>` +
      `<div><strong>${fmtMinutes(trends.avgResolutionMinutes)}</strong><span>Avg. time to clear</span></div>`;
  } catch {
    $("#trends-stats").innerHTML =
      `<p class="comments-empty">Could not load trends.</p>`;
  }
};
$("#export-geojson").onclick = () => {
  const rows = visible();
  if (!rows.length) return toast("Nothing to export with these filters.");
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
    `Exported ${rows.length} report${rows.length === 1 ? "" : "s"} as GeoJSON.`,
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
  $("#import-status").textContent = "Reading file…";
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
      $("#import-status").textContent =
        `Importing… ${i + 1}/${features.length}`;
    }
    $("#import-dialog").close();
    e.target.reset();
    const parts = [];
    if (created) parts.push(`${created} added`);
    if (merged) parts.push(`${merged} merged into existing reports`);
    if (skipped) parts.push(`${skipped} skipped`);
    toast(
      `Import finished: ${parts.join(", ") || "nothing to import"}.${problems.length ? " First issues: " + problems.join(" ") : ""}`,
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
      toast("Saved for this session. Browser storage is unavailable.");
    }
    render();
    return;
  }
  if (e.target.closest("#share-report")) {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Report link copied. It opens on this same server.");
    } catch {
      toast("Copy the report link from your browser’s address bar.");
    }
    return;
  }
  if (e.target.closest("#follow-report")) {
    const r = reports.find((x) => x.id === selected);
    if (followed.has(selected)) {
      followed.delete(selected);
      delete seen[selected];
      toast("Unfollowed. You won't get updates on this report.");
    } else {
      followed.add(selected);
      seen[selected] = snapshotReports(r ? [r] : [])[selected];
      toast(
        "Following. We'll flag new confirmations, notes, and clearance votes.",
      );
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
      `<form class="reply-form"><input name="note" maxlength="300" placeholder="Write a reply…" aria-label="Write a reply" autocomplete="off"><button type="submit">Reply</button></form><p class="comment-error" role="alert"></p>`,
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
        ? "Thanks! Two clearance votes resolve an issue."
        : "Thanks for keeping the neighborhood updated.",
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
    toast(isReply ? "Reply posted." : "Note posted. Thanks for the heads-up.");
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
  $("#report-dialog").showModal();
}
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
  toast("Location selected. Choose “Report friction” to add a heads-up.");
});
$("#report-form").onsubmit = async (e) => {
  e.preventDefault();
  const button = $(".submit");
  button.disabled = true;
  const body = Object.fromEntries(new FormData(e.target));
  ["lat", "lng", "severity"].forEach((k) => (body[k] = Number(body[k])));
  try {
    const result = await api("/reports", body);
    $("#report-dialog").close();
    e.target.reset();
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
    toast(
      result.merged
        ? "Merged with a nearby report. Your confirmation was added."
        : "Your heads-up is on the map. Thank you!",
    );
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
        ? "Thanks — this report is now hidden pending review."
        : `Thanks. That's flag ${result.flagCount} of 3 to hide it.`,
    );
    await refresh();
  } catch (error) {
    $("#flag-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$("#about").onclick = () => $("#about-dialog").showModal();
document
  .querySelectorAll("dialog .close")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
$("#locate").onclick = () => {
  if (!navigator.geolocation)
    return toast("Geolocation is unavailable in this browser.");
  navigator.geolocation.getCurrentPosition(
    (p) => {
      chosen = { lat: p.coords.latitude, lng: p.coords.longitude };
      map.setView(chosen, 15);
      toast(
        "Map centered on your location. Reporting currently supports San Francisco.",
      );
    },
    () => toast("Location unavailable. Click the map to choose a spot."),
  );
};
refresh();
setInterval(refresh, 15000);
