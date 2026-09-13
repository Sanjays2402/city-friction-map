# Engineering notes

## Request flow

The browser loads a Vite bundle and requests reports from Express. Leaflet displays the geographic data; discovery filters and sorting run locally. New reports and verification votes go through the same-origin JSON API into SQLite. Connected browsers poll every 15 seconds.

| Location           | Responsibility                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `src/main.js`      | Map, report form, URL selection, saved reports, following, comments, and rendering             |
| `src/enrich.js`    | Pure live-data helpers: WMO weather labels, dock/case/alert marker colors, 311→category mapping |
| `server/enrich.js` | Cached proxies for Bay Wheels, SF 311, Open-Meteo weather/AQI, NWS alerts (60s TTL, 8s timeout) |
| `server/gamify.js` | Pure gamification math: XP, levels, badges, streaks, weekly challenge — no schema changes        |
| `src/discovery.js` | Pure filtering, sorting, summary, follow-update detection, CSV export, and saved-state parsing |
| `src/style.css`    | Responsive interface                                                                           |
| `server/api.js`    | HTTP validation, status codes, and endpoint routing                                            |
| `server/domain.js` | Categories, input rules, geographic distance, and predictions                                  |
| `server/store.js`  | Persistent reports, uniqueness constraints, and transactions                                   |
| `tests/`           | Domain, HTTP, persistence, and production browser tests                                        |

## Duplicate detection

A new report merges into the nearest active, non-hidden report of the same category when either rule matches, provided it was updated within **90 minutes**:

- **Close by:** within **90 meters** (Haversine distance).
- **Same story, nearby:** headline token-Jaccard similarity ≥ **0.5** within **250 meters**.

A merge adds a confirmation and preserves the original description. Repeated confirmations from the same browser return a conflict.

This is an O(n) scan intended for a small dataset. Nearby but separate incidents may merge. Venue identity and a spatial index are natural extensions.

## Clearance estimates

Each category has a base duration. Impact multiplies it by `0.65 + severity × 0.25`. The last confirmation resets the starting point. The interface displays a rounded range spanning 65–140% of remaining duration, with a minimum lower bound of five minutes.

Fewer than four confirmations receive a Low evidence label; four or more receive Medium. These labels are not calibrated probabilities. Expired estimates show **Needs a fresh update**; they do not automatically resolve reports.

## Votes and consistency

The database enforces one vote per report, browser ID, and action. Two clearance votes resolve a report. SQLite transactions commit report changes together with their vote records. A regression test injects a failing write and verifies that the vote rolls back, allowing retry.

Anonymous IDs live in local storage and can be reset; this prevents casual double-clicking, not coordinated abuse. Community flagging hides misleading reports after three distinct-visitor flags, and an admin token enables hide/restore/delete moderation (see Trust & safety).

## Client state

Saved report IDs stay in local storage and survive reloads on that browser. Filters compose across category, text, status, impact, demo data, and saved reports. Sorting never mutates the source array. Citywide summary counts follow the demo-data toggle, independently of the other filters.

Selecting a report adds `?report=<id>` to the URL. Opening that URL restores the report and its active or resolved tab. Clipboard sharing copies the URL; if clipboard permission is unavailable, the address bar remains the fallback. A localhost link is usable only by someone who can reach that server.

## Neighbor notes

Reports accept short community notes (1–300 characters) through `POST /api/reports/:id/comments`. Notes persist in a `comments` table with the report id, visitor id, body, and timestamp. Authors are anonymized as `Neighbor <id>`; raw visitor IDs are never returned to clients. Note text is escaped when rendered. Report listings include a `commentCount` so cards can show discussion at a glance.

## Following reports

Following is client-side. Followed report IDs live in local storage (`friction-followed`), alongside a snapshot of each report's last-seen state (`friction-seen`: confirmations, note count, clearance votes, status). On every 15-second refresh, `detectUpdates` compares the snapshot against fresh data and the client toasts a plain-language summary ("2 new confirmations, 1 new neighbor note"). Unseen updates get a dot on the report card until opened. A "Followed" filter narrows the list to followed reports.

## Photo attachments

Reports accept an optional `photoUrl`: an `http(s)` URL under 500 characters, validated server-side. Photos render as a lazy-loaded thumbnail in the report detail with a link to the full image; a 📷 badge marks cards that have one. URLs are escaped like all other report text. There is no image hosting or upload — the project links out, keeping storage and moderation scope unchanged.

## CSV export

The "Export CSV" control downloads the currently filtered report list (respecting category, search, status, impact, demo, saved, and followed filters). `toCSV` in `src/discovery.js` is a pure function covering id, title, location, category, severity, status, confirmations, clearance votes, note count, coordinates, and timestamps, with RFC 4180 quoting.

## Discovery & insight

**Live enrichment.** `server/enrich.js` proxies four free, keyless public APIs so the browser never talks to third parties directly: Bay Wheels GBFS (station information + status joined by station id, filtered to San Francisco, projected to id/name/coordinates/bikes/docks/e-bikes), the SF 311 cases Socrata dataset (`data.sfgov.org/resource/vw6y-z8j6`, 100 most recent, projected to id/type/status/address/coordinates/opened), Open-Meteo current conditions (temperature, WMO weather code, wind) and air quality (US AQI, EPA category label, PM2.5), and NWS active alerts for San Francisco (capped at 5, projected to id/event/headline/severity/description/expires plus a small GeoJSON polygon when the alert carries one). Each endpoint keeps a 60-second in-memory cache, aborts upstreams after 8 seconds, answers `{ available: false }` on any failure, and sends a `CityFrictionMap/1.0` User-Agent where required (NWS). The routes are read-only GETs under `/api/enrich/*`, need no visitor id, and are mounted before the `/api` router so its 404 handler never swallows them. Client toggles render bike stations as circle markers colored by open-dock availability (green/amber/red) with a popup button that pre-fills the report form for that station, and 311 cases as small status-colored markers with top-type filter chips and a popup button that files the case as a friction report in one click (the case type maps to the closest report category). NWS alerts surface as a pulsing header pill plus a toggleable layer: polygon-bearing alerts draw dashed severity-colored outlines, while zone-only alerts (which NWS often ships without geometry) render as a subtle SF-wide indicator instead of a fabricated boundary. A single opacity slider scales all enrichment layers at once. The weather pill refreshes every 10 minutes, combines temperature with the AQI label, and hides itself when the upstream is down. Pure presentation helpers (WMO labels, dock/case/alert colors, 311→category mapping) live in `src/enrich.js` and are unit-tested.

**Gamification.** `server/gamify.js` computes a profile for any visitor id from existing contributions — no schema changes beyond `votes.created_at` (auto-migrated) and no stored XP. Actions earn XP: report 10, confirmation 3, neighbor note 5, helpful reaction received 2, validated flag 4, thanks received 1. Levels are Newcomer 0 🌱, Regular 50 🧭, Helper 150 🤝, Guardian 300 🛡️, Legend 600 🌟, with progress toward the next level. The automatic creator confirmation is excluded from earned confirmation XP. A streak counts consecutive UTC days with any contribution; a weekly challenge (resetting Monday UTC) asks for 5 confirmations; 8 badges cover first report, 10 reports, fact-checking, streaks, wise neighbors (5 helpful), debunking (validated flag), exploring 5 grid cells, and night-owl contributions (9pm–5am UTC). `GET /api/gamification/me` (visitor id required) returns the profile; the header “You” chip shows the level icon, XP progress bar, and opens the full profile dialog; the client toasts on level-up after successful writes; `/api/contributors` rows now also carry `levelName`/`levelIcon` rendered in the leaderboard.

**Trip check.** `src/tripcheck.js` exports the pure `corridorReports(reports, path, widthM)` helper: active, non-hidden reports whose point-to-segment distance (equirectangular projection) falls within the corridor width, sorted by distance. Widths clamp to 50–2000 m. The client’s trip mode turns map clicks into route stops, draws the polyline, and lists corridor hits with distances; results recompute on every refresh. Stops are draggable markers — `dragend` updates the path and re-matches immediately.

**Heatmap.** A `leaflet.heat` toggle layers intensity = severity ÷ 3 over the visible reports. The plugin attaches to the bundled Leaflet via a preloaded dynamic import (`window.L` is exposed first). The layer refreshes whenever filters change. While the heatmap is on, a time-window selector (all time / 24h / 7d) re-renders the layer from report `updatedAt` timestamps entirely client-side — no new endpoint.

**Drawn alert zones.** A draw mode turns press-drag on the map into a live circle preview; on release the zone dialog opens with the drawn radius (rounded to 50 m, clamped to 100–5000 m) offered as a one-off option, and the label prompt creates the zone through the existing `POST /api/alerts`. `Esc` cancels mid-drag; map dragging is disabled while drawing so the gesture never pans the map.

**Trends.** `GET /api/trends` returns 14 day-buckets of new reports per category, the average resolution time in minutes across resolved reports, and totals (active, resolved, notes, confirmations). The client renders a stacked canvas bar chart with a legend plus stat cards.

**GeoJSON.** The filtered list exports as a FeatureCollection (`src/geojson.js`). Import accepts a FeatureCollection (or bare array, max 500 features); each feature is validated (Point geometry, SF bounds, known category, field lengths) and POSTed individually, so similar reports merge naturally. The UI reports added/merged/skipped counts with the first problems.

## Polish

**Keyboard shortcuts.** `/` focuses search, `?` opens the guide, `f` toggles the followed filter, and `Escape` closes dialogs, the detail panel, and map modes. Matching logic lives in `src/shortcuts.js` and is unit-tested.

**PWA.** `public/manifest.webmanifest` (standalone, theme `#133c32`, 192/512 PNG icons generated without dependencies) and `public/sw.js` make the app installable. The service worker is cache-first for the app shell and network-first for `/api/*` with a cache fallback, versioned per release. Registration is skipped on localhost so development and e2e runs never serve stale shells.

## Engagement

**Reactions.** `POST /api/comments/:id/react` toggles a “helpful” reaction per visitor (stored in the `reactions` table). Comment payloads carry `helpfulCount`.

**Threaded replies.** `POST /api/reports/:id/comments` accepts `{body, parentId}`. Replies nest one level: the parent must be a top-level note on the same report. Existing databases gain `parent_id` through an `ALTER TABLE` migration; new ones include the column. `GET` returns top-level notes with a `replies` array each.

**Area alerts.** Visitors define named watch zones (`POST /api/alerts`, validated: label 1–60 chars, radius 100–5000 m, inside San Francisco) stored in the `alerts` table. `GET /api/alerts/matches` returns each zone with the active, non-hidden reports inside it, sorted by distance. Zones are listed, drawn as map circles, and deletable (`DELETE /api/alerts/:id`, owner only). The client’s alert mode turns map clicks into zone placement.

**Contributors.** `GET /api/contributors` ranks the top 20 neighbors by score = 3 × reports + 2 × notes + 1 × confirmations, using anonymized names. Reports record their `creator` visitor id at creation time.

## Trust & safety

**Flagging.** Any visitor can flag a report as `spam`, `inaccurate`, `inappropriate`, or `duplicate` through `POST /api/reports/:id/flag`. Flags persist in a `flags` table with one flag per report, visitor, and reason set. Repeat flags from the same visitor return 409. Three flags from distinct visitors set `hidden: true` on the report. Report listings include `hidden` and `flagCount`; the client excludes hidden reports from the list and map by default, but they remain fetchable by id. Votes and notes on hidden reports return 409 until the report is restored.

**Moderation.** `POST /api/reports/:id/moderate` accepts `{action: "hide" | "restore" | "delete"}` and requires a valid `X-Admin-Token` header compared with `crypto.timingSafeEqual` against the `ADMIN_TOKEN` environment variable. Missing or wrong tokens return 403, as does an unconfigured server. Delete removes the report plus its votes, notes, and flags in a single transaction.

**Rate limiting.** All `POST /api/*` routes share a limiter keyed by `X-Visitor-Id` (falling back to IP): 60 writes per 15 minutes, answering 429 with a JSON error. The limiter is the only new runtime dependency (`express-rate-limit`).

## API

| Method | Endpoint                    | Behavior                                              |
| ------ | --------------------------- | ----------------------------------------------------- |
| GET    | `/api/health`               | Health check                                          |
| GET    | `/api/reports`              | Reports with derived estimates and note counts        |
| POST   | `/api/reports`              | Create (201) or merge (200)                           |
| POST   | `/api/reports/:id/vote`     | Confirm or submit clearance                           |
| GET    | `/api/reports/:id/comments` | Notes for a report, oldest first (with replies)       |
| POST   | `/api/reports/:id/comments` | Add a note or a reply with `{body, parentId}` (201)   |
| POST   | `/api/comments/:id/react`   | Toggle a “helpful” reaction on a note                 |
| GET    | `/api/alerts`               | This visitor’s alert zones                            |
| POST   | `/api/alerts`               | Create a named watch zone (201)                       |
| DELETE | `/api/alerts/:id`           | Remove an alert zone (owner only)                     |
| GET    | `/api/alerts/matches`       | Zones with active reports inside each                 |
| GET    | `/api/contributors`         | Top 20 neighbors by weighted activity                 |
| GET    | `/api/trends`               | 14-day category counts, resolution avg, totals        |
| GET    | `/api/reports/:id`          | One report, including hidden ones (404 when missing)  |
| GET    | `/api/enrich/bikeshare`     | Bay Wheels SF stations with live dock counts          |
| GET    | `/api/enrich/cases311`      | 100 most recent SF 311 cases                          |
| GET    | `/api/enrich/weather`       | Current SF temperature, conditions, and wind          |
| GET    | `/api/enrich/airquality`    | SF US AQI, EPA label, PM2.5                           |
| GET    | `/api/enrich/alerts`        | Active NWS alerts for SF (max 5, projected)           |
| GET    | `/api/gamification/me`      | XP, level, streak, badges, weekly challenge           |
| POST   | `/api/reports/:id/flag`     | Flag a report; hides at 3 distinct-visitor flags      |
| POST   | `/api/reports/:id/moderate` | `hide`, `restore`, or `delete` (admin token required) |
| POST   | `/api/reports/:id/kudos`    | Thank a report's author (toggle per visitor)          |
| GET    | `/api/reports/similar`      | Nearby same-category candidates (`lat`, `lng`, `category`, `city`) |
| GET    | `/api/moderation/flags`     | Flagged reports with reasons (admin token required)   |
| GET    | `/api/feed.xml`             | RSS feed of the 20 most recent active reports (`city`) |

Writes require JSON and an `X-Visitor-Id` header containing 12–80 letters, numbers, or hyphens. Report fields are `category`, `title`, `location`, `description`, `photoUrl` (optional), `photo` (optional inline JPEG/PNG/WebP data URL, ≤350 KB), `lat`, `lng`, and `severity` (1–3). Vote bodies use `{"action":"confirm"}` or `{"action":"clear"}`. Note bodies use `{"body":"…"}` (1–300 characters).

Errors distinguish invalid input (400), forbidden origins (403), missing reports (404), conflicts (409), oversized bodies (413), unsupported content types (415), and unexpected failures (500). Body size is limited to 400 KB. SQL values are parameterized, rendered report text is escaped, and storage internals are not returned to clients.

## Configuration

| Variable      | Default                | Purpose                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| `PORT`        | `3000`                 | HTTP port                                                                                  |
| `HOST`        | `127.0.0.1`            | Listening interface                                                                        |
| `DB_PATH`     | `data/friction.sqlite` | Database location; `:memory:` for temporary demos                                          |
| `SEED_DEMO`   | `true`                 | Populate an empty database with fictional reports                                          |
| `NODE_ENV`    | unset                  | `production` serves the built frontend                                                     |
| `ADMIN_TOKEN` | unset                  | Shared secret enabling `POST /api/reports/:id/moderate`; moderation is disabled without it |

The application uses one Node process with synchronous SQLite. Hosting requires a writable persistent disk. Node 22 may emit an experimental warning for its built-in SQLite module. Map tiles and fonts require internet access. High-traffic deployments should arrange a dedicated tile service rather than relying on community tile capacity.

## Screenshots

`scripts/screenshots.js` captures the desktop, detail, report form, and mobile views from a running local instance. It does not create reports. For consistent sample content, start a separate in-memory demo:

```sh
npm run build
PORT=3200 DB_PATH=:memory: npm start
# In another terminal:
node scripts/screenshots.js http://127.0.0.1:3200
```

Screenshots request only the displayed map areas. Automated regression tests block tile requests.
