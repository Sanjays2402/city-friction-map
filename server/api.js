import express from "express";

// An isolated API factory lets tests exercise real HTTP behavior without Vite.
export function createApi(store) {
  const api = express.Router();
  api.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  api.use(express.json({ limit: "8kb" }));
  api.use((req, res, next) => {
    if (req.method !== "POST") return next();
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
    if (!req.is("application/json")) {
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
  api.post("/reports", (req, res) => {
    const result = store.create(req.body, req.get("x-visitor-id"));
    res.status(result.merged ? 200 : 201).json(result);
  });
  api.post("/reports/:id/vote", (req, res) => {
    res.json(
      store.vote(req.params.id, req.get("x-visitor-id"), req.body?.action),
    );
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
    res
      .status(status)
      .json({
        error:
          status === 500
            ? "Could not save this update. Please try again."
            : err.message,
      });
  });
  return api;
}
