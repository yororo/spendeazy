import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

type Selection = {
  classification: "diagnostic" | "full-acceptance" | "ci-shard" | "unclassified";
  selectionComplete: boolean;
  selectors: { specs: string[]; grep: string | null };
};

function readSelection(): Selection {
  if (!process.env.SPENDEAZY_E2E_SELECTION) {
    return { classification: "unclassified", selectionComplete: false, selectors: { specs: [], grep: null } };
  }
  const value: unknown = JSON.parse(process.env.SPENDEAZY_E2E_SELECTION);
  const isRecord = (data: unknown): data is Record<string, unknown> =>
    data !== null && typeof data === "object" && !Array.isArray(data);
  if (!isRecord(value) || !isRecord(value.selectors)) throw new Error("Invalid E2E selection metadata.");
  const { classification, selectionComplete, selectors } = value;
  const { specs, grep } = selectors;
  if ((classification !== "diagnostic" && classification !== "full-acceptance" && classification !== "ci-shard" && classification !== "unclassified") ||
      !Array.isArray(specs) || !specs.every((file): file is string => typeof file === "string") ||
      (grep !== null && typeof grep !== "string") ||
      selectionComplete !== (classification === "full-acceptance")) {
    throw new Error("Invalid E2E selection metadata.");
  }
  const filtered = specs.length > 0 || grep !== null;
  if (filtered !== (classification === "diagnostic") ||
      (classification === "full-acceptance" && process.env.SPENDEAZY_E2E_SHARD)) {
    throw new Error("E2E selection metadata contradicts the effective scope.");
  }
  if (filtered && (process.env.CI || process.env.SPENDEAZY_E2E_SHARD)) {
    throw new Error("Diagnostic selection cannot run in CI or with sharding.");
  }
  return { classification, selectionComplete, selectors: { specs, grep } };
}
const selection = readSelection();
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
