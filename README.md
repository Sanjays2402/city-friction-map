# City Friction Map

**Less friction. More city.** A community map of the everyday obstacles between you and a good day.

[![Verify](https://github.com/Sanjays2402/city-friction-map/actions/workflows/ci.yml/badge.svg)](https://github.com/Sanjays2402/city-friction-map/actions/workflows/ci.yml)
![Node.js 22.13+](https://img.shields.io/badge/Node.js-22.13%2B-426b42)
![SQLite](https://img.shields.io/badge/storage-SQLite-557768)

Spot long queues, blocked sidewalks, noisy roadwork, empty bike docks, closed restrooms, and poor reception. Share a heads-up, confirm what’s still there, and help the next person find a smoother day.

![City overview with filters, alert zones, trip check, heatmap, and interactive map](docs/screenshots/desktop.png)

## Features

| Explore                                   | Contribute                             | Keep track                                    |
| ----------------------------------------- | -------------------------------------- | --------------------------------------------- |
| Interactive map with six categories       | Submit a report at a chosen location   | Save reports on your device                   |
| Search places and report text             | Merge nearby duplicate reports         | Open an issue from a shareable link           |
| Filter major obstacles or hide demo data  | Confirm an obstacle or vote it cleared | View active, major, stale, and cleared counts |
| Sort by recency, impact, or confirmations | Two clearance votes resolve an issue   | See explainable clearance ranges              |
| Follow reports for update notifications   | Leave neighbor notes on any report     | Export the filtered list as CSV               |
| Filter to followed reports only           | Attach an optional photo URL           | See comment and photo badges on cards         |
| Flag misleading reports for review        | Smarter duplicate merging by headline  | Community flags hide misleading reports       |
| React “helpful” on useful neighbor notes  | Reply to neighbor notes (one level)    | Watch areas for new friction with alert zones |
| See the most active neighbors             |                                        |                                               |
| Check friction along a planned route      | Toggle a severity heatmap              | See 14-day trends and averages                |
| Drag trip stops to fine-tune the route    | Time-filter the heatmap (24h / 7d)     | Draw alert zones by dragging on the map       |
| Toggle live Bay Wheels dock availability  | Toggle live SF 311 cases on the map    | See live SF weather in the header             |
| Rich marker popups with photos and notes  |                                        |                                               |
| Export reports as GeoJSON                 | Import a GeoJSON FeatureCollection     |                                               |
| Keyboard shortcuts for power users        | Installable PWA with offline shell     |                                               |

Reports persist in SQLite and refresh across browsers every 15 seconds. The responsive interface supports desktop and mobile.

Live enrichment layers (Bay Wheels bike-share, SF 311 cases, Open-Meteo weather) come from free keyless public APIs through cached server proxies; when an upstream is down, its toggle quietly stands down instead of showing dead data.

## Screenshots

<table>
  <tr>
    <td width="70%"><img src="docs/screenshots/report-detail.png" alt="Report details with confidence, community votes, neighbor notes, flagging, save and share controls" /></td>
    <td width="30%"><img src="docs/screenshots/mobile.png" alt="Mobile city overview, filters, map and report list" /></td>
  </tr>
  <tr><td align="center">Report details & community verification</td><td align="center">Mobile exploration</td></tr>
</table>

<details>
<summary>See the reporting flow</summary>

![Report form with category, location and impact inputs](docs/screenshots/report-form.png)

</details>

Screenshots show fictional San Francisco demo reports, labeled in the interface.

## Run locally

Requires **Node.js 22.13+** and npm.

```sh
git clone https://github.com/Sanjays2402/city-friction-map.git
cd city-friction-map
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No paid API keys are required; map tiles and fonts use external services.

For the production build:

```sh
npm run build
npm start
```

Data is stored in `data/friction.sqlite`. Set `SEED_DEMO=false` with a fresh database to start without sample reports. The server defaults to localhost; use `HOST=0.0.0.0` for container hosting with persistent storage.

## Stack & architecture

**JavaScript · Vite · Leaflet · Express · SQLite · Playwright · GitHub Actions**

The client handles discovery and map interactions. The Express API validates updates, and SQLite transactions keep reports and votes consistent. Duplicate detection combines category, distance, and recency. Clearance ranges use transparent rules instead of an opaque prediction model.

Read the [engineering notes](docs/architecture.md) for algorithms, API endpoints, configuration, and design tradeoffs.

## Tests

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

The suite covers report validation, geographic matching, vote conflicts, database persistence and rollback, filtering, saved reports, shared links, and mobile layout. Browser tests build and exercise the production app. GitHub Actions runs verification on every push and pull request.

## Project scope

This is a working portfolio MVP scoped to San Francisco. Demo reports are fictional; clearance estimates are heuristics, not guarantees. Saved reports are browser-local, and shared links require access to the same server. Anonymous browser IDs are not verified identities. Public deployment would still need real authentication, a suitable tile provider, and an `ADMIN_TOKEN` for the moderation endpoints.

## Credits

[Leaflet](https://leafletjs.com/) · [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) ([tile policy](https://operations.osmfoundation.org/policies/tiles/)) · DM Sans and Manrope via Google Fonts.
