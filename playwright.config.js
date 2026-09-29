import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  // Browser scenarios share one in-memory API database; avoid write races.
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command: "npm run build && PORT=3100 DB_PATH=:memory: npm start",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
  },
});
