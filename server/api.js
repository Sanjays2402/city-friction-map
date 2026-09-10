import express from "express";
import { timingSafeEqual } from "node:crypto";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { computeProfile } from "./gamify.js";

// An isolated API factory lets tests exercise real HTTP behavior without Vite.
export function createApi(store, options = {}) {
  const api = express.Router();
  api.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  api.use(express.json({ limit: "8kb" }));
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
    ["POST", "DELETE"].includes(req.method)
      ? writeLimit(req, res, next)
      : next(),
  );
  const adminToken = options.adminToken || "";
  const requireAdmin = (req, res, next) => {
    const presented = Buffer.from(req.get("x-admin-token") || "", "utf8");
    const expected = Buffer.from(adminToken, "utf8");
    if (
      !adminToken ||
      presented.length !== expected.length ||
      !timingSafeEqual(presented, expected)
    )
      return res.status(403).json({ error: "Moderation is restricted." });
    next();
  };
  api.use((req, res, next) => {
    if (!["POST", "DELETE"].includes(req.method)) return next();
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
    if (req.method === "POST" && !req.is("application/json")) {
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
  api.get("/reports", (_, res) => res.json(store.list()));
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
  api.post("/reports/:id/moderate", requireAdmin, (req, res) => {
    res.json(store.moderate(req.params.id, req.body?.action));
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
  api.get("/contributors", (_, res) => res.json(store.contributors()));
  api.get("/trends", (_, res) => res.json(store.trends()));
  api.get("/gamification/me", (req, res) => {
    const visitorId = req.get("x-visitor-id") || "";
    if (!/^[a-zA-Z0-9-]{12,80}$/.test(visitorId))
      return res.status(400).json({ error: "A valid visitor ID is required." });
    res.json(computeProfile(store, visitorId));
  });
  api.use((_, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  api.use((err, req, res, next) => {
    if (err.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "Report exceeds the 8 KB request limit." });
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
