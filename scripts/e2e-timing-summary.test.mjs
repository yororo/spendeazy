import assert from "node:assert/strict";
import test from "node:test";
import { compareRuns, summarizeRun } from "./e2e-timing-summary.mjs";

test("reports nested attempts, retries, skipped tests and shard duration", () => {
  const browser = { config: { workers: 1 }, stats: { duration: 80 }, suites: [{ suites: [{ specs: [
    { title: "retried", file: "one.ts", tests: [{ status: "flaky", expectedStatus: "passed", results: [
      { retry: 0, status: "failed", duration: 30 }, { retry: 1, status: "passed", duration: 20 },
    ] }] },
    { title: "skipped", file: "two.ts", tests: [{ status: "skipped", expectedStatus: "skipped", results: [] }] },
  ] }] }] };
  const run = summarizeRun(browser, { runId: "run", shard: "1/2", wallMs: 100, phases: { startupMs: 10 }, teardownMs: 5, exitCode: 0 });
  assert.equal(run.tests, 2);
  assert.equal(run.retries, 1);
  assert.equal(run.skipped, 1);
  assert.equal(run.flaky, 1);
  assert.equal(run.browserMs, 80);
  assert.equal(run.launcherMs, 100);
  assert.equal(run.slowest[0].attempts.length, 2);
});

const run = duration => ({ shard: "full", clock: "fixed", workers: 1, browserMs: duration,
  launcherMs: duration + 10, retries: 0, flaky: 0, skipped: 0, failed: 0, exitCode: 0 });

test("compares medians and rejects savings accompanied by more retries", () => {
  const before = [run(90), run(100), run(110)];
  const after = [run(40), run(50), run(60)];
  assert.equal(compareRuns(before, after).browserSavedMs, 50);
  assert.equal(compareRuns(before, after).accepted, true);
  assert.equal(compareRuns(before, [{ ...after[0], retries: 1 }, ...after.slice(1)]).accepted, false);
});

test("rejects incomplete, filtered, skipped or mismatched benchmark runs", () => {
  const runs = [run(100), run(100), run(100)];
  assert.throws(() => compareRuns(runs.slice(1), runs), /three runs/);
  for (const invalid of [{ skipped: 1 }, { exitCode: 1 }, { shard: "1\/2" }, { browserReportMissing: true }]) {
    assert.throws(() => compareRuns(runs, [{ ...runs[0], ...invalid }, ...runs.slice(1)]), /unfiltered successful/);
  }
  assert.throws(() => compareRuns(runs, runs.map(value => ({ ...value, clock: "different" }))), /must match/);
});
