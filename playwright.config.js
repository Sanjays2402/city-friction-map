import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command: "PORT=3100 DB_PATH=:memory: npm run dev",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
  },
});
