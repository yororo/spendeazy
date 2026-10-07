import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

function discover(specs, grep = null, shard) {
  const selection = {
    classification: specs.length || grep !== null ? "diagnostic" : shard ? "ci-shard" : "full-acceptance",
    selectionComplete: !specs.length && grep === null && !shard,
    selectors: { specs, grep },
  };
  const result = list(selection, shard);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  const titles = [];
  function visit(suite) {
    for (const child of suite.suites ?? []) visit(child);
    for (const spec of suite.specs ?? []) titles.push(spec.title);
  }
  for (const suite of report.suites) visit(suite);
  return titles;
}

function list(selection, shard, ci = "") {
  return spawnSync(process.execPath, [resolve("web/node_modules/@playwright/test/cli.js"), "test", "--list", "--reporter=json", ...(shard ? [`--shard=${shard}`] : [])], {
    cwd: resolve("web"), encoding: "utf8", timeout: 30000,
    env: { ...process.env, CI: ci, SPENDEAZY_E2E_SHARD: shard ?? "", SPENDEAZY_E2E_SELECTION: JSON.stringify(selection) },
  });
}

test("exact specs form a union and title selection narrows it or searches the full tree", () => {
  const mobileTitle = "keeps mobile date fields contained and shows their picker affordance";
  const freshTitle = "creates a fresh User with real first-time provisioning";
  assert.deepEqual(discover(["e2e/mobile-date-fields.spec.ts"]), [mobileTitle]);
  assert.deepEqual(discover([], freshTitle), [freshTitle]);
  assert.deepEqual(discover(["e2e/mobile-date-fields.spec.ts", "e2e/local-test.spec.ts"], "fresh User|date fields").sort(), [freshTitle, mobileTitle].sort());
  assert.deepEqual(discover(["e2e/mobile-date-fields.spec.ts", "e2e/budget-status.spec.ts"]), [
    "exact monthly Budget status and spending scope at 390px",
    "exact monthly Budget status and spending scope at 1440px",
    mobileTitle,
  ]);
});

test("both unfiltered CI shards together discover the full maintained suite", () => {
  const full = discover([]).sort();
  const shards = [...discover([], null, "1/2"), ...discover([], null, "2/2")].sort();
  assert.ok(full.length > 0);
  assert.deepEqual(shards, full);
});

test("malformed or contradictory metadata cannot narrow CI or claim full acceptance", () => {
  const full = { classification: "full-acceptance", selectionComplete: true, selectors: { specs: [], grep: null } };
  for (const invalid of [
    null, {}, { ...full, classification: "other" }, { ...full, selectionComplete: false },
    { ...full, selectors: { specs: [42], grep: null } },
    { ...full, selectors: { specs: [], grep: 42 } },
    { ...full, selectors: { specs: [], grep: "provisions" } },
    { ...full, classification: "diagnostic", selectionComplete: false },
  ]) {
    const result = list(invalid, undefined, "true");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /selection metadata/);
  }
  const result = list({ classification: "diagnostic", selectionComplete: false, selectors: { specs: [], grep: "provisions" } }, undefined, "true");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot run in CI/);
});
