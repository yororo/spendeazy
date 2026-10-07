import { defineConfig, devices } from "@playwright/test";

const shardSuffix = process.env.SPENDEAZY_E2E_SHARD?.replaceAll("/", "-") ?? "full";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The browser suite shares one isolated database and fixed synthetic Users.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  outputDir: `test-results-${shardSuffix}`,
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { outputFolder: `playwright-report/${shardSuffix}`, open: "never" }],
        ["blob", { outputDir: `blob-report/${shardSuffix}` }],
      ]
    : "line",
  use: {
    baseURL: process.env.SPENDEAZY_E2E_BASE_URL ?? "http://127.0.0.1:5175",
    channel: "msedge",
    timezoneId: "UTC",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Edge"],
  },
});
