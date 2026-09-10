import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { categories } from "../server/domain.js";
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
<main><section class="intro"><div><div class="eyebrow">A LITTLE LOCAL KNOWLEDGE GOES A LONG WAY</div><h1>Less friction.<br class="mobile-break"> More city.</h1><p>The little things between you and a good day. See them coming.</p></div><div class="city"><span class="pulse"></span> San Francisco <small>Community map · Demo enabled</small></div></section>
<section class="toolbar" aria-label="Map filters"><label class="search"><span>⌕</span><input id="search" placeholder="Search a place or a problem…" aria-label="Search reports"></label><div id="filters" class="filters"><button class="chip active" data-category="all">All friction</button>${Object.entries(
  categories,
)
  .map(
    ([k, c]) =>
      `<button class="chip" data-category="${k}"><span style="color:${c.color}">${c.icon}</span> ${c.label}</button>`,
  )
  .join("")}</div></section>
<section class="workspace"><aside><div class="list-header"><div><h2>Around the neighborhood</h2><p id="count">Loading reports…</p></div><span class="live">● LIVE</span></div><div class="tabs"><button id="active-tab" class="selected">Happening now</button><button id="resolved-tab">Cleared</button></div><div id="list" aria-live="polite"></div><div class="aside-footer">↗ Small updates. Smoother days.</div></aside><div class="map-wrap"><div id="map" aria-label="Map of San Francisco friction reports"></div><div class="map-note"><span class="pulse"></span> The city, with a little more context.</div><button id="locate" title="Show my location" aria-label="Show my location">⌖</button><div id="detail" hidden></div><div class="map-legend"><span>●</span> Community reported <i></i> Estimates, not guarantees</div></div></section>
<section class="bottom"><div><span class="leaf">✳</span><div><strong>Your two-second update could save someone twenty minutes.</strong><p>Spotted something? Put it on the map.</p></div></div><button id="report-bottom">Share a heads-up ↗</button></section><footer><span>Built for the everyday in-between.</span><span id="updated">Connecting…</span></footer></main>
<dialog id="report-dialog"><form id="report-form"><div class="dialog-head"><div class="eyebrow">GOOD NEIGHBORS LEAVE A HEADS-UP</div><button type="button" class="close" aria-label="Close report form">×</button></div><h2>What’s slowing things down?</h2><p>Choose a spot on the map first, or enter its coordinates below.</p><label>Type of friction<select name="category">${Object.entries(
  categories,
)
  .map(([k, c]) => `<option value="${k}">${c.label}</option>`)
  .join(
    "",
  )}</select></label><label>Short headline<input name="title" required minlength="3" maxlength="100" placeholder="e.g. Sidewalk blocked by roadwork"></label><label>Place or intersection<input name="location" required minlength="3" maxlength="100" placeholder="e.g. Market & 8th Street"></label><div class="form-row"><label>Latitude<input name="lat" type="number" step="any" min="37.70" max="37.84" required></label><label>Longitude<input name="lng" type="number" step="any" min="-122.53" max="-122.35" required></label></div><label>Impact<select name="severity"><option value="1">Minor · a little inconvenient</option><option value="2" selected>Moderate · plan around it</option><option value="3">Major · significant obstacle</option></select></label><label>Anything useful to know?<textarea name="description" maxlength="500" rows="3" placeholder="What would you tell a friend walking this way?"></textarea></label><label>Photo URL <span class="optional-note">(optional)</span><input name="photoUrl" type="url" maxlength="500" placeholder="https://… a photo of the obstacle"></label><p class="form-note">Similar reports within 90 meters may be merged. Reports are visible to everyone using this server.</p><p id="form-error" role="alert"></p><button class="primary submit" type="submit">Put it on the map ↗</button></form></dialog>
<dialog id="about-dialog"><button class="close" aria-label="Close explanation">×</button><div class="eyebrow">A SHARED PICTURE OF YOUR CITY</div><h2>Little reports. Real usefulness.</h2><p>Report an obstacle, confirm it’s still there, or tell your neighbors it has cleared. Two independent browser clearance votes resolve an issue.</p><h3>How estimates work</h3><p>Time ranges use category and impact, measured from the latest confirmation. They’re heuristic estimates, not trained forecasts. More confirmations improve the evidence label, but confidence is never a statistical probability.</p><h3>An honest starting point</h3><p>Initial San Francisco reports are fictional and labeled DEMO. New reports are saved in SQLite and shared across connected browsers. Updates refresh every 15 seconds. Anonymous browser IDs prevent casual repeated votes, but are not identity verification.</p></dialog><div id="toast" role="status"></div>`;
$(".toolbar").insertAdjacentHTML(
  "beforebegin",
  '<section id="summary" class="summary" aria-label="City overview"></section>',
);
$(".toolbar").insertAdjacentHTML(
  "afterend",
  `<section class="discovery-controls" aria-label="Report preferences"><div><button id="saved-toggle" class="preference" aria-pressed="false">☆ Saved reports <span id="saved-count">0</span></button><button id="followed-toggle" class="preference" aria-pressed="false">🔔 Followed <span id="followed-count">0</span></button><label><input id="major-only" type="checkbox"> Major impact only</label><label><input id="hide-demo" type="checkbox"> Hide demo reports</label><button id="export-csv" class="preference">⭳ Export CSV</button></div><label class="sort-label">Sort by <select id="sort"><option value="recent">Latest update</option><option value="impact">Highest impact</option><option value="confirmed">Most confirmed</option></select></label></section>`,
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
let chosen = map.getCenter(),
  pin;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
async function api(path, body) {
  const response = await fetch(
    "/api" + path,
    body
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Visitor-Id": visitor,
          },
          body: JSON.stringify(body),
        }
      : undefined,
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
  const stats = summarize(reports.filter((r) => !hideDemo || !r.demo));
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
    L.marker([r.lat, r.lng], {
      title: r.title,
      icon: L.divIcon({
        className: "friction-marker",
        html: `<span style="--accent:${c.color}" class="${selected === r.id ? "picked" : ""}">${c.icon}</span>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      }),
    })
      .addTo(markers)
      .on("click", () => select(r.id));
  });
  if (selected) {
    // Rebuilding the detail panel wipes a half-typed neighbor note, so only
    // re-render it when the underlying report actually changed.
    const r = reports.find((x) => x.id === selected);
    const key = r
      ? `${r.updatedAt}:${r.commentCount || 0}:${r.status}:${r.clearVotes}:${r.confirmations}`
      : "gone";
    if (key !== lastDetailKey) {
      lastDetailKey = key;
      renderDetail();
    }
  }
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
function commentHtml(c) {
  return `<div class="comment"><div class="comment-meta"><strong>${escape(c.author)}</strong><span>${age(c.createdAt)}</span></div><p>${escape(c.body)}</p></div>`;
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
    `<button class="close" id="close-detail" aria-label="Close report details">×</button><div class="eyebrow" style="color:${c.color}">${c.label}${r.demo ? " · FICTIONAL DEMO" : ""}</div><h2>${escape(r.title)}</h2><p class="place">${escape(r.location)}</p>${r.photoUrl ? `<a class="report-photo" href="${escape(r.photoUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escape(r.photoUrl)}" alt="Photo attached to this report" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.report-photo').remove()"></a>` : ""}<p>${escape(r.description)}</p><div class="prediction"><span>Estimated time to clear<strong>${r.status === "resolved" ? "Cleared" : escape(r.prediction.label)}</strong></span><span class="confidence">${r.prediction.confidence} confidence</span></div><p class="detail-note">Category-based estimate · ${r.confirmations} confirmations · ${r.clearVotes}/2 clearance votes</p>${r.status === "active" ? '<div class="detail-actions"><button class="primary" data-vote="confirm">Still here +1</button><button data-vote="clear">✓ Looks clear</button></div>' : "<p>✓ The community marked this cleared.</p>"}`;
  $("#detail").insertAdjacentHTML(
    "beforeend",
    `<div class="report-tools"><button id="save-report" aria-pressed="${saved.has(r.id)}">${saved.has(r.id) ? "★ Saved" : "☆ Save report"}</button><button id="follow-report" aria-pressed="${followed.has(r.id)}">${followed.has(r.id) ? "🔔 Following" : "🔔 Follow updates"}</button><button id="share-report">Copy report link ↗</button></div><div class="impact-line">${["", "Minor inconvenience", "Moderate impact", "Major obstacle"][r.severity]} · First reported ${age(r.createdAt)}</div><div class="comments"><h3>Neighbor notes</h3><div id="comment-list"><p class="comments-empty">Loading notes…</p></div><form id="comment-form"><input name="note" maxlength="300" placeholder="Add a useful note for neighbors…" aria-label="Add a neighbor note" autocomplete="off"><button type="submit">Post</button></form><p id="comment-error" role="alert"></p></div>`,
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
  if (e.target.closest("#close-detail")) {
    selected = null;
    lastDetailKey = null;
    const url = new URL(location.href);
    url.searchParams.delete("report");
    history.replaceState(null, "", url);
    $("#detail").hidden = true;
    render();
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
  if (e.target.id !== "comment-form") return;
  e.preventDefault();
  const input = e.target.elements.note;
  const button = e.target.querySelector("button");
  const text = input.value.trim();
  if (!text || !selected) return;
  button.disabled = true;
  $("#comment-error").textContent = "";
  try {
    const comment = await api(`/reports/${selected}/comments`, {
      body: text,
    });
    input.value = "";
    const list = $("#comment-list");
    if (list) {
      const empty = list.querySelector(".comments-empty");
      if (empty) empty.remove();
      list.insertAdjacentHTML("beforeend", commentHtml(comment));
    }
    const r = reports.find((x) => x.id === selected);
    if (r) {
      r.commentCount = (r.commentCount || 0) + 1;
      seen = snapshotReports(reports);
      writeSnapshot(localStorage, seen);
      lastDetailKey = null;
      render();
    }
    toast("Note posted. Thanks for the heads-up.");
  } catch (error) {
    $("#comment-error").textContent = error.message;
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
