import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3317", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3317",
    url: "http://localhost:3317/api/health",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_ENV: "development",
      APP_URL: "http://localhost:3317",
      DATABASE_URL: "pglite::memory:",
      DATA_DIR: "./test-results/app-data",
      ALLOW_DEMO: "true",
      COOKIE_SECURE: "false",
      ADMIN_EMAILS:
        "discovery-reviewer@example.test,verification-reviewer@example.test",
    },
  },
});
