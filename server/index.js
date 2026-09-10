import express from "express";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createStore } from "./store.js";
import { createApi } from "./api.js";
import { createEnrichRouter } from "./enrich.js";
const app = express(),
  port = Number(process.env.PORT || 3000);
mkdirSync("data", { recursive: true });
const store = createStore(
  process.env.DB_PATH || "data/friction.sqlite",
  process.env.SEED_DEMO !== "false",
);
app.disable("x-powered-by");
// Live-data proxies mount first so the /api 404 handler below never
// swallows them. They are read-only and need no visitor id.
app.use("/api/enrich", createEnrichRouter());
app.use("/api", createApi(store, { adminToken: process.env.ADMIN_TOKEN }));
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
