import express from "express";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createStore } from "./store.js";
const app = express(),
  port = Number(process.env.PORT || 3000);
mkdirSync("data", { recursive: true });
const store = createStore(
  process.env.DB_PATH || "data/friction.sqlite",
  process.env.SEED_DEMO !== "false",
);
app.use(express.json({ limit: "8kb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.method === "POST") {
    const origin = req.get("origin");
    if (origin && new URL(origin).host !== req.get("host"))
      return res
        .status(403)
        .json({ error: "Cross-origin writes are disabled." });
    if (!/^[a-zA-Z0-9-]{12,80}$/.test(req.get("x-visitor-id") || ""))
      return res.status(400).json({ error: "A valid visitor ID is required." });
  }
  next();
});
app.get("/api/health", (_, res) => res.json({ ok: true }));
app.get("/api/reports", (_, res) => res.json(store.list()));
app.post("/api/reports", (req, res, next) => {
  try {
    res.status(201).json(store.create(req.body, req.get("x-visitor-id")));
  } catch (e) {
    next(e);
  }
});
app.post("/api/reports/:id/vote", (req, res, next) => {
  try {
    res.json(
      store.vote(req.params.id, req.get("x-visitor-id"), req.body?.action),
    );
  } catch (e) {
    next(e);
  }
});
app.use("/api", (_, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
app.use((err, req, res, next) =>
  res.status(400).json({ error: err.message || "Request failed." }),
);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`City Friction running at http://localhost:${port}`),
);
process.on("SIGTERM", () =>
  server.close(() => {
    store.close();
    process.exit(0);
  }),
);
