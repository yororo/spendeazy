import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The browser suite shares one isolated database and fixed synthetic Users.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  use: {
    baseURL: process.env.SPENDEAZY_E2E_BASE_URL ?? "http://127.0.0.1:5175",
    channel: "msedge",
    timezoneId: "UTC",
    trace: "on-first-retry",
    ...devices["Desktop Edge"],
  },
});
