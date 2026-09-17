import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev", url: "http://localhost:3000/api/health",
    reuseExistingServer: false, timeout: 120000,
    env: { APP_URL: "http://localhost:3000", DATA_DIR: "./test-results/app-data", ALLOW_DEMO: "true", COOKIE_SECURE: "false" }
  }
});
