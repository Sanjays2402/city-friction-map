# Engineering notes

## Request flow

The browser loads a Vite bundle and requests reports from Express. Leaflet displays the geographic data; discovery filters and sorting run locally. New reports and verification votes go through the same-origin JSON API into SQLite. Connected browsers poll every 15 seconds.

| Location           | Responsibility                                                |
| ------------------ | ------------------------------------------------------------- |
| `src/main.js`      | Map, report form, URL selection, saved reports, and rendering |
| `src/discovery.js` | Pure filtering, sorting, summary, and saved-state parsing     |
| `src/style.css`    | Responsive interface                                          |
| `server/api.js`    | HTTP validation, status codes, and endpoint routing           |
| `server/domain.js` | Categories, input rules, geographic distance, and predictions |
| `server/store.js`  | Persistent reports, uniqueness constraints, and transactions  |
| `tests/`           | Domain, HTTP, persistence, and production browser tests       |

## Duplicate detection

A new report merges into the nearest active report of the same category within **90 meters**, provided it was updated within **90 minutes**. The Haversine formula computes distance. A merge adds a confirmation and preserves the original description. Repeated confirmations from the same browser return a conflict.

This is an O(n) scan intended for a small dataset. Nearby but separate incidents may merge. Venue identity, text similarity, and a spatial index are natural extensions.

## Clearance estimates

Each category has a base duration. Impact multiplies it by `0.65 + severity × 0.25`. The last confirmation resets the starting point. The interface displays a rounded range spanning 65–140% of remaining duration, with a minimum lower bound of five minutes.

Fewer than four confirmations receive a Low evidence label; four or more receive Medium. These labels are not calibrated probabilities. Expired estimates show **Needs a fresh update**; they do not automatically resolve reports.

## Votes and consistency

The database enforces one vote per report, browser ID, and action. Two clearance votes resolve a report. SQLite transactions commit report changes together with their vote records. A regression test injects a failing write and verifies that the vote rolls back, allowing retry.

Anonymous IDs live in local storage and can be reset; this prevents casual double-clicking, not coordinated abuse. Reports currently have no administrative deletion or moderation workflow.

## Client state

Saved report IDs stay in local storage and survive reloads on that browser. Filters compose across category, text, status, impact, demo data, and saved reports. Sorting never mutates the source array. Citywide summary counts follow the demo-data toggle, independently of the other filters.

Selecting a report adds `?report=<id>` to the URL. Opening that URL restores the report and its active or resolved tab. Clipboard sharing copies the URL; if clipboard permission is unavailable, the address bar remains the fallback. A localhost link is usable only by someone who can reach that server.

## API

| Method | Endpoint                | Behavior                       |
| ------ | ----------------------- | ------------------------------ |
| GET    | `/api/health`           | Health check                   |
| GET    | `/api/reports`          | Reports with derived estimates |
| POST   | `/api/reports`          | Create (201) or merge (200)    |
| POST   | `/api/reports/:id/vote` | Confirm or submit clearance    |

Writes require JSON and an `X-Visitor-Id` header containing 12–80 letters, numbers, or hyphens. Report fields are `category`, `title`, `location`, `description`, `lat`, `lng`, and `severity` (1–3). Vote bodies use `{"action":"confirm"}` or `{"action":"clear"}`.

Errors distinguish invalid input (400), forbidden origins (403), missing reports (404), conflicts (409), oversized bodies (413), unsupported content types (415), and unexpected failures (500). Body size is limited to 8 KB. SQL values are parameterized, rendered report text is escaped, and storage internals are not returned to clients.

## Configuration

| Variable    | Default                | Purpose                                           |
| ----------- | ---------------------- | ------------------------------------------------- |
| `PORT`      | `3000`                 | HTTP port                                         |
| `HOST`      | `127.0.0.1`            | Listening interface                               |
| `DB_PATH`   | `data/friction.sqlite` | Database location; `:memory:` for temporary demos |
| `SEED_DEMO` | `true`                 | Populate an empty database with fictional reports |
| `NODE_ENV`  | unset                  | `production` serves the built frontend            |

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
