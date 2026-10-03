import { defineConfig } from "@playwright/test";
const externalBase = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "./tests/browser",
  // Browser scenarios share one in-memory API database; avoid write races.
  workers: 1,
  use: { baseURL: externalBase || "http://127.0.0.1:3100" },
  webServer: externalBase
    ? undefined
    : {
        command: `${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}PORT=3100 DB_PATH=:memory: npm start`,
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
