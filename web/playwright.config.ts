import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const selection: {
  classification: string;
  selectionComplete: boolean;
  selectors: { specs: string[]; grep: string | null };
} = process.env.SPENDEAZY_E2E_SELECTION
  ? JSON.parse(process.env.SPENDEAZY_E2E_SELECTION)
  : { classification: "unclassified", selectionComplete: false, selectors: { specs: [], grep: null } };
if (selection.classification === "diagnostic" && (process.env.CI || process.env.SPENDEAZY_E2E_SHARD)) {
  throw new Error("Diagnostic selection cannot run in CI or with sharding.");
}
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const shardSuffix = process.env.SPENDEAZY_E2E_SHARD?.replaceAll("/", "-") ?? "full";
const reportDirectory = process.env.SPENDEAZY_E2E_REPORT_DIR ?? `e2e-reports/${shardSuffix}`;
const workerCount = process.env.SPENDEAZY_E2E_WORKERS ?? "1";
if (!["1", "2"].includes(workerCount)) {
  throw new Error("SPENDEAZY_E2E_WORKERS must be 1 or 2; the default is 1.");
}

export default defineConfig({
  testDir: "./e2e",
  metadata: { ...selection },
  ...(selection.selectors.specs.length ? {
    testMatch: selection.selectors.specs.map(file => new RegExp(`^${escapeRegex(resolve(file))}$`)),
  } : {}),
  ...(selection.selectors.grep !== null ? { grep: new RegExp(selection.selectors.grep) } : {}),
  fullyParallel: true,
  // Keep the measured default; two workers are an explicit benchmark choice.
  workers: Number(workerCount),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  outputDir: `${reportDirectory}/test-results`,
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { outputFolder: `${reportDirectory}/html`, open: "never" }],
        ["blob", { outputDir: `${reportDirectory}/blob` }],
        ["json", { outputFile: `${reportDirectory}/playwright.json` }],
      ]
    : [["line"], ["json", { outputFile: `${reportDirectory}/playwright.json` }]],
  use: {
    baseURL: process.env.SPENDEAZY_E2E_BASE_URL ?? "http://127.0.0.1:5175",
    channel: "msedge",
    timezoneId: "UTC",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Edge"],
  },
});
