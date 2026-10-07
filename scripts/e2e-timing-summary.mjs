import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function summarizeRun(browser, launcher) {
  const tests = [];
  function visit(suite) {
    for (const child of suite.suites ?? []) visit(child);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        tests.push({
          title: spec.title,
          file: spec.file,
          outcome: test.status,
          expectedStatus: test.expectedStatus,
          attempts: test.results.map(result => ({
            retry: result.retry, status: result.status, durationMs: result.duration,
          })),
        });
      }
    }
  }
  for (const suite of browser.suites) visit(suite);
  return {
    runId: launcher.runId, shard: launcher.shard, clock: launcher.clock,
    workers: browser.config.workers,
    browserMs: browser.stats.duration, launcherMs: launcher.wallMs,
    phases: { ...launcher.phases, teardownMs: launcher.teardownMs },
    exitCode: launcher.exitCode,
    tests: tests.length,
    retries: tests.reduce((total, test) => total + test.attempts.filter(attempt => attempt.retry > 0).length, 0),
    skipped: tests.filter(test => test.outcome === "skipped").length,
    failed: tests.filter(test => test.outcome === "unexpected").length,
    flaky: tests.filter(test => test.outcome === "flaky").length,
    slowest: tests.sort((a, b) =>
      b.attempts.reduce((total, result) => total + result.durationMs, 0) -
      a.attempts.reduce((total, result) => total + result.durationMs, 0),
    ).slice(0, 10),
  };
}

function loadRuns(directory) {
  const runs = [];
  function visit(path) {
    const entries = readdirSync(path, { withFileTypes: true });
    if (entries.some(entry => entry.name === "launcher.json")) {
      const launcher = JSON.parse(readFileSync(join(path, "launcher.json"), "utf8"));
      if (!entries.some(entry => entry.name === "playwright.json")) {
        runs.push({ runId: launcher.runId, shard: launcher.shard, exitCode: launcher.exitCode,
          phases: launcher.phases, launcherMs: launcher.wallMs, browserReportMissing: true });
      } else {
        runs.push(summarizeRun(JSON.parse(readFileSync(join(path, "playwright.json"), "utf8")), launcher));
      }
      return;
    }
    for (const entry of entries) if (entry.isDirectory()) visit(join(path, entry.name));
  }
  visit(resolve(directory));
  if (!runs.length) throw new Error(`No launcher timing reports in ${directory}`);
  return runs;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function compareRuns(before, after) {
  for (const runs of [before, after]) {
    if (runs.length < 3) throw new Error("A matched benchmark requires at least three runs per configuration.");
    if (runs.some(run => run.shard !== "full" || run.browserReportMissing || run.exitCode || run.skipped || run.failed)) {
      throw new Error("Benchmark requires unfiltered successful runs without skips or missing reports.");
    }
  }
  if (new Set([...before, ...after].map(run => run.clock)).size !== 1 ||
      [before, after].some(runs => new Set(runs.map(run => run.workers)).size !== 1)) {
    throw new Error("Benchmark clocks must match and each configuration must use a consistent worker count.");
  }
  const summarize = runs => ({
    runs: runs.length,
    workers: runs[0].workers,
    browserMedianMs: median(runs.map(run => run.browserMs)),
    launcherMedianMs: median(runs.map(run => run.launcherMs)),
    retries: runs.reduce((total, run) => total + run.retries, 0),
    flaky: runs.reduce((total, run) => total + run.flaky, 0),
  });
  const baseline = summarize(before);
  const optimized = summarize(after);
  return {
    baseline, optimized,
    browserSavedMs: baseline.browserMedianMs - optimized.browserMedianMs,
    launcherSavedMs: baseline.launcherMedianMs - optimized.launcherMedianMs,
    accepted: optimized.browserMedianMs < baseline.browserMedianMs &&
      optimized.retries <= baseline.retries && optimized.flaky <= baseline.flaky,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--compare" && args.length === 3) {
      const comparison = compareRuns(loadRuns(args[1]), loadRuns(args[2]));
      console.log(JSON.stringify(comparison, null, 2));
      if (!comparison.accepted) process.exitCode = 1;
    } else if (args.length === 1) {
      console.log(JSON.stringify(loadRuns(args[0]), null, 2));
    } else {
      throw new Error("Usage: node scripts/e2e-timing-summary.mjs <reports-directory> | --compare <before-directory> <after-directory>");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
