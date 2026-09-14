import express from "express";
import { timingSafeEqual } from "node:crypto";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { computeProfile } from "./gamify.js";
import { cityById, publicCities } from "./cities.js";

// An isolated API factory lets tests exercise real HTTP behavior without Vite.
export function createApi(store, options = {}) {
  const api = express.Router();
  api.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  api.use(express.json({ limit: "400kb" }));
  const { windowMs = 15 * 60 * 1000, limit = 60 } = options.writeLimit || {};
  const writeLimit = rateLimit({
    windowMs,
    limit,
    keyGenerator: (req, res) =>
      req.get("x-visitor-id") || ipKeyGenerator(req, res),
    standardHeaders: false,
    legacyHeaders: false,
    handler: (_, res) =>
      res.status(429).json({
        error: "Too many updates. Please wait a few minutes, then try again.",
      }),
  });
  api.use((req, res, next) =>
    ["POST", "PATCH", "DELETE"].includes(req.method)
      ? writeLimit(req, res, next)
      : next(),
  );
  const adminToken = options.adminToken || "";
  const checkAdmin = (req) => {
    const presented = Buffer.from(req.get("x-admin-token") || "", "utf8");
    const expected = Buffer.from(adminToken, "utf8");
    return (
      !!adminToken &&
      presented.length === expected.length &&
      timingSafeEqual(presented, expected)
    );
  };
  const requireAdmin = (req, res, next) => {
    if (!checkAdmin(req))
      return res.status(403).json({ error: "Moderation is restricted." });
    next();
  };
  api.use((req, res, next) => {
    if (!["POST", "PATCH", "DELETE"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (origin) {
      let parsed;
      try {
        parsed = new URL(origin);
      } catch {
        return res.status(403).json({ error: "Invalid request origin." });
      }
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.host !== req.get("host")
      ) {
        return res
          .status(403)
          .json({ error: "Cross-origin writes are disabled." });
      }
    }
    if (["POST", "PATCH"].includes(req.method) && !req.is("application/json")) {
      return res
        .status(415)
        .json({ error: "Send an application/json request." });
    }
    if (!/^[a-zA-Z0-9-]{12,80}$/.test(req.get("x-visitor-id") || "")) {
      return res.status(400).json({ error: "A valid visitor ID is required." });
    }
    next();
  });
  api.get("/health", (_, res) => res.json({ ok: true }));
  api.get("/cities", (_, res) => res.json(publicCities()));
  const cityFilter = (req) => {
    const city = req.query.city;
    if (city !== undefined && !cityById(city))
      throw Object.assign(new Error("Unknown city."), { status: 400 });
    return city ? { city } : {};
  };
  api.get("/reports", (req, res) =>
    res.json(
      store.list({
        ...cityFilter(req),
        includeExpired: req.query.includeExpired === "1",
      }),
    ),
  );
  api.get("/reports/similar", (req, res) => {
    const lat = Number(req.query.lat),
      lng = Number(req.query.lng);
    const city = req.query.city;
    if (city !== undefined && !cityById(city))
      throw Object.assign(new Error("Unknown city."), { status: 400 });
    res.json(store.similar({ lat, lng, category: req.query.category, city }));
  });
  api.get("/reports/:id", (req, res) => {
    res.json(store.get(req.params.id));
  });
  api.post("/reports", (req, res) => {
    const result = store.create(req.body, req.get("x-visitor-id"));
    res.status(result.merged ? 200 : 201).json(result);
  });
  api.post("/reports/:id/vote", (req, res) => {
    res.json(
      store.vote(req.params.id, req.get("x-visitor-id"), req.body?.action),
    );
  });
  api.post("/reports/:id/flag", (req, res) => {
    res.json(
      store.flag(req.params.id, req.get("x-visitor-id"), req.body?.reason),
    );
  });
  api.post("/reports/:id/kudos", (req, res) => {
    res.json(store.toggleKudos(req.params.id, req.get("x-visitor-id")));
  });
  api.post("/reports/:id/resolve", (req, res) => {
    res.json(
      store.resolveReport(
        req.params.id,
        req.get("x-visitor-id"),
        req.body,
        checkAdmin(req),
      ),
    );
  });
  api.patch("/reports/:id", (req, res) => {
    res.json(
      store.editReport(req.params.id, req.get("x-visitor-id"), req.body),
    );
  });
  api.post("/reports/:id/moderate", requireAdmin, (req, res) => {
    res.json(store.moderate(req.params.id, req.body?.action));
  });
  api.post("/moderation/bulk", requireAdmin, (req, res) => {
    res.json(store.bulkModerate(req.body?.ids, req.body?.action));
  });
  api.post("/moderation/merge", requireAdmin, (req, res) => {
    res.json(store.mergeReports(req.body?.sourceId, req.body?.targetId));
  });
  api.get("/moderation/flags", requireAdmin, (req, res) => {
    res.json(store.flaggedReports());
  });
  api.get("/reports/:id/comments", (req, res) => {
    res.json(store.listComments(req.params.id));
  });
  api.post("/reports/:id/comments", (req, res) => {
    res
      .status(201)
      .json(store.addComment(req.params.id, req.get("x-visitor-id"), req.body));
  });
  api.post("/comments/:id/react", (req, res) => {
    res.json(store.toggleReaction(req.params.id, req.get("x-visitor-id")));
  });
  api.get("/alerts/matches", (req, res) => {
    res.json(store.alertMatches(req.get("x-visitor-id")));
  });
  api.get("/alerts", (req, res) => {
    res.json(store.listAlerts(req.get("x-visitor-id")));
  });
  api.post("/alerts", (req, res) => {
    res.status(201).json(store.createAlert(req.get("x-visitor-id"), req.body));
  });
  api.delete("/alerts/:id", (req, res) => {
    res.json(store.deleteAlert(req.get("x-visitor-id"), req.params.id));
  });
  api.get("/contributors", (req, res) =>
    res.json(store.contributors(cityFilter(req))),
  );
  api.get("/trends", (req, res) => res.json(store.trends(cityFilter(req))));
  api.get("/notifications", (req, res) => {
    res.json(store.listNotifications(req.get("x-visitor-id")));
  });
  api.post("/notifications/read", (req, res) => {
    const ids = req.body?.ids;
    if (ids !== undefined && !Array.isArray(ids))
      return res.status(400).json({ error: "ids must be an array." });
    res.json(store.markNotificationsRead(req.get("x-visitor-id"), ids));
  });
  api.get("/gamification/me", (req, res) => {
    const visitorId = req.get("x-visitor-id") || "";
    if (!/^[a-zA-Z0-9-]{12,80}$/.test(visitorId))
      return res.status(400).json({ error: "A valid visitor ID is required." });
    res.json(computeProfile(store, visitorId));
  });
  // Public RSS feed of recent reports per city, for feed readers and
  // neighborhood blogs. No visitor id needed.
  api.get("/feed.xml", (req, res) => {
    const filter = cityFilter(req);
    const cityName = filter.city ? cityById(filter.city).name : "All cities";
    const items = store
      .list(filter)
      .filter((r) => !r.hidden && r.status === "active" && !r.expired)
      .slice(0, 20);
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const host = req.get("host") || "";
    const itemXml = items
      .map(
        (r) =>
          `<item><title>${esc(r.title)}</title>` +
          `<link>https://${esc(host)}/r/${esc(r.id)}</link>` +
          `<guid>https://${esc(host)}/r/${esc(r.id)}</guid>` +
          `<description>${esc(r.location)} — ${esc(r.description || "").slice(0, 200)}</description>` +
          `<pubDate>${new Date(r.createdAt).toUTCString()}</pubDate></item>`,
      )
      .join("");
    res
      .set("Content-Type", "application/rss+xml; charset=utf-8")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>` +
          `<title>City Friction — ${esc(cityName)}</title>` +
          `<link>https://${esc(host)}/</link>` +
          `<description>Recent community friction reports in ${esc(cityName)}.</description>` +
          itemXml +
          `</channel></rss>`,
      );
  });
  api.use((_, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  api.use((err, req, res, next) => {
    if (err.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "Report exceeds the 400 KB request limit." });
    if (err.type === "entity.parse.failed")
      return res
        .status(400)
        .json({ error: "Request body must be valid JSON." });
    const status = err.status || 500;
    if (status === 500) console.error("API request failed:", err);
    res.status(status).json({
      error:
        status === 500
          ? "Could not save this update. Please try again."
          : err.message,
    });
  });
  return api;
}
