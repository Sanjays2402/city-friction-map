import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { categories } from "../server/domain.js";
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
  )}</select></label><label>Short headline<input name="title" required minlength="3" maxlength="100" placeholder="e.g. Sidewalk blocked by roadwork"></label><label>Place or intersection<input name="location" required minlength="3" maxlength="100" placeholder="e.g. Market & 8th Street"></label><div class="form-row"><label>Latitude<input name="lat" type="number" step="any" min="37.70" max="37.84" required></label><label>Longitude<input name="lng" type="number" step="any" min="-122.53" max="-122.35" required></label></div><label>Impact<select name="severity"><option value="1">Minor · a little inconvenient</option><option value="2" selected>Moderate · plan around it</option><option value="3">Major · significant obstacle</option></select></label><label>Anything useful to know?<textarea name="description" maxlength="500" rows="3" placeholder="What would you tell a friend walking this way?"></textarea></label><p class="form-note">Similar reports within 90 meters may be merged. Reports are visible to everyone using this server.</p><p id="form-error" role="alert"></p><button class="primary submit" type="submit">Put it on the map ↗</button></form></dialog>
<dialog id="about-dialog"><button class="close" aria-label="Close explanation">×</button><div class="eyebrow">A SHARED PICTURE OF YOUR CITY</div><h2>Little reports. Real usefulness.</h2><p>Report an obstacle, confirm it’s still there, or tell your neighbors it has cleared. Two independent browser clearance votes resolve an issue.</p><h3>How estimates work</h3><p>Time ranges use category and impact, measured from the latest confirmation. They’re heuristic estimates, not trained forecasts. More confirmations improve the evidence label, but confidence is never a statistical probability.</p><h3>An honest starting point</h3><p>Initial San Francisco reports are fictional and labeled DEMO. New reports are saved in SQLite and shared across connected browsers. Updates refresh every 15 seconds. Anonymous browser IDs prevent casual repeated votes, but are not identity verification.</p></dialog><div id="toast" role="status"></div>`;
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
  return reports.filter(
    (r) =>
      r.status === status &&
      (category === "all" || r.category === category) &&
      `${r.title} ${r.location} ${r.description}`.toLowerCase().includes(query),
  );
}
function render() {
  const rows = visible();
  $("#count").textContent =
    `${rows.length} ${status === "active" ? "active heads-ups" : "cleared reports"} · all mapped areas`;
  $("#list").innerHTML = rows.length
    ? rows
        .map((r) => {
          const c = categories[r.category];
          return `<button class="report-card ${selected === r.id ? "chosen" : ""}" data-id="${r.id}"><div class="card-top"><span class="category-icon" style="--accent:${c.color}">${c.icon}</span><span class="category-label">${c.label}</span>${r.demo ? '<span class="demo">DEMO</span>' : ""}<span class="age">${age(r.updatedAt)}</span></div><h3>${escape(r.title)}</h3><p class="place">${escape(r.location)}</p><div class="card-bottom"><span class="estimate">${r.status === "resolved" ? "✓ Cleared" : `◷ ${escape(r.prediction.label)}`}</span><span>♧ ${r.confirmations} confirmations</span></div></button>`;
        })
        .join("")
    : '<div class="empty"><span>☀</span><h3>A little breathing room.</h3><p>No reports match these filters.</p></div>';
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
  if (selected) renderDetail();
  $("#updated").textContent = lastUpdated
    ? `Updated ${age(lastUpdated)} · refreshes every 15s`
    : "Connecting…";
}
function select(id) {
  selected = id;
  const r = reports.find((x) => x.id === id);
  map.flyTo([r.lat, r.lng], 15, { duration: 0.5 });
  render();
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
    `<button class="close" id="close-detail" aria-label="Close report details">×</button><div class="eyebrow" style="color:${c.color}">${c.label}${r.demo ? " · FICTIONAL DEMO" : ""}</div><h2>${escape(r.title)}</h2><p class="place">${escape(r.location)}</p><p>${escape(r.description)}</p><div class="prediction"><span>Estimated time to clear<strong>${r.status === "resolved" ? "Cleared" : escape(r.prediction.label)}</strong></span><span class="confidence">${r.prediction.confidence} confidence</span></div><p class="detail-note">Category-based estimate · ${r.confirmations} confirmations · ${r.clearVotes}/2 clearance votes</p>${r.status === "active" ? '<div class="detail-actions"><button class="primary" data-vote="confirm">Still here +1</button><button data-vote="clear">✓ Looks clear</button></div>' : "<p>✓ The community marked this cleared.</p>"}`;
}
async function refresh() {
  try {
    reports = await api("/reports");
    lastUpdated = Date.now();
    render();
  } catch (e) {
    $("#count").textContent = "Could not load reports.";
    $("#updated").textContent = "Connection lost · retrying automatically";
    toast(e.message);
  }
}
$("#list").addEventListener("click", (e) => {
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
  $("#detail").hidden = true;
  render();
});
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
    $("#detail").hidden = true;
    $("#active-tab").classList.toggle("selected", value === "active");
    $("#resolved-tab").classList.toggle("selected", value === "resolved");
    render();
  };
$("#detail").onclick = async (e) => {
  if (e.target.closest("#close-detail")) {
    selected = null;
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
