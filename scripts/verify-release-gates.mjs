import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../api/package.json", import.meta.url));
const { load } = require("js-yaml");
const workflow = load(readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8"));
const entry = load(readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8"));
const ci = load(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));

// Evaluate the actual workflow conditions against release scenarios. This does
// not replace GitHub execution; it makes failure and skip combinations reviewable.
function permitted(job, { event = "workflow_dispatch", project = "all", validation = "success", changes = "success", migrate = "success", api = "success", webChanged = "true", apiChanged = "true", verifyOnly = false, cancelled = false, action = "opened" } = {}) {
  const needs = {
    validate: { result: validation },
    changes: { result: changes, outputs: { web: webChanged, api: apiChanged } },
    migrate: { result: migrate, outputs: { image: "syoro/spendeazy-api@sha256:digest" } },
    api: { result: api },
  };
  // GitHub applies success() implicitly unless a status function is explicit.
  const expression = workflow.jobs[job].if;
  if (!expression.includes("always()") && (validation !== "success" || changes !== "success" || cancelled)) return false;
  return Boolean(new Function("github", "inputs", "needs", "always", "cancelled", `return (${expression});`)(
    { event_name: event, event: { action } }, { project, verify_only: verifyOnly, validated: validation === "success" }, needs, () => true, () => cancelled,
  ));
}

for (const validation of ["failure", "cancelled", "skipped", "pending", "in_progress"]) {
  for (const job of ["web", "api", "migrate"]) assert.equal(permitted(job, { validation }), false, `${job}: ${validation} validation`);
}
for (const changes of ["failure", "cancelled", "skipped"]) {
  for (const job of ["web", "api", "migrate"]) assert.equal(permitted(job, { changes }), false);
}
for (const api of ["failure", "cancelled", "pending"]) assert.equal(permitted("web", { api }), false);
for (const job of ["web", "api"]) assert.equal(permitted(job, { cancelled: true }), false);
for (const job of ["web", "api"]) assert.equal(permitted(job, { migrate: "failure", api: "skipped" }), false, `${job}: migration failure`);
assert.equal(permitted("migrate", { event: "push", apiChanged: "true" }), true);
assert.equal(permitted("migrate", { event: "push", apiChanged: "false" }), false);
assert.equal(permitted("migrate", { event: "workflow_dispatch", project: "web" }), false);
assert.equal(permitted("migrate", { event: "workflow_dispatch", verifyOnly: true }), false);
assert.equal(permitted("api", { event: "workflow_dispatch", verifyOnly: true, migrate: "skipped" }), true);
assert.equal(permitted("web", { event: "workflow_dispatch", verifyOnly: true, migrate: "skipped" }), true);
for (const [project, web, api] of [["all", true, true], ["web", true, false], ["api", false, true]]) {
  assert.equal(permitted("api", { project, migrate: api ? "success" : "skipped" }), api);
  assert.equal(permitted("web", { project, migrate: api ? "success" : "skipped", api: api ? "success" : "skipped" }), web);
}
for (const [webChanged, apiChanged, web, api] of [["true", "true", true, true], ["true", "false", true, false], ["false", "true", false, true], ["false", "false", false, false]]) {
  const scenario = { event: "push", webChanged, apiChanged, migrate: api ? "success" : "skipped", api: api ? "success" : "skipped" };
  assert.equal(permitted("migrate", scenario), api);
  assert.equal(permitted("api", scenario), api);
  assert.equal(permitted("web", scenario), web);
}
assert.equal(permitted("web", { event: "pull_request", migrate: "skipped", api: "skipped" }), true);
assert.equal(permitted("api", { event: "pull_request" }), false);
assert.equal(permitted("web", { event: "pull_request", action: "closed", migrate: "skipped", api: "skipped" }), false);
assert.equal(workflow.jobs.close_web_preview.needs, undefined);
assert.deepEqual(workflow.jobs.web.needs, ["changes", "migrate", "api"]);
assert.deepEqual(workflow.jobs.api.needs, ["changes", "migrate"]);
assert.deepEqual(workflow.jobs.migrate.needs, ["changes"]);
assert.equal(entry.jobs.validate.uses, "./.github/workflows/ci.yml");
assert.equal(entry.jobs.publish.uses, "./.github/workflows/publish.yml");
assert.equal(entry.concurrency, undefined);
assert.equal(entry.jobs.validate.concurrency["cancel-in-progress"], true);
assert.equal(workflow.concurrency["cancel-in-progress"], false);
assert.equal(ci.on.push, undefined);
assert.equal(ci.on.pull_request, undefined);
assert.equal(entry.jobs.gate.name, "Validate projects and isolated browser suite");
assert.deepEqual(ci.jobs.validate.needs, ["preflight", "api", "web", "e2e"]);
assert.deepEqual(ci.jobs.e2e.strategy.matrix.shard, [1, 2]);
const browserSteps = ci.jobs.e2e.steps;
const compilerIndex = browserSteps.findIndex(step => step.run === "npm run typecheck:e2e" && step["working-directory"] === "web");
assert.ok(compilerIndex >= 0, "Browser jobs must require the E2E compiler");
assert.equal(browserSteps[compilerIndex]["continue-on-error"], undefined);
assert.ok(compilerIndex < browserSteps.findIndex(step => step.name === "Install Playwright Microsoft Edge"));
assert.ok(compilerIndex < browserSteps.findIndex(step => step.run === "node scripts/local-test-launcher.mjs --e2e"));
assert.equal(ci.jobs.e2e.strategy["fail-fast"], false);
assert.ok(entry.jobs.gate.if.startsWith("always()"));
assert.equal(entry.jobs.gate.steps[0].run, 'test "$VALIDATION_RESULT" = success');
assert.ok(ci.jobs.validate.steps[0].run.includes('all(.[]; .result == "success")'));
const publicationExpression = new Function("github", "needs", "always", "cancelled", `return (${entry.jobs.publish.if});`);
for (const result of ["failure", "cancelled", "skipped", "pending", "in_progress"]) {
  for (const [validation, gate] of [[result, "success"], ["success", result]]) {
    assert.equal(publicationExpression({ event_name: "push", event: {} }, { validate: { result: validation }, gate: { result: gate } }, () => true, () => false), false);
  }
}
assert.equal(publicationExpression({ event_name: "pull_request", event: { action: "closed", pull_request: { user: { login: "maintainer" } } } }, { validate: { result: "skipped" }, gate: { result: "skipped" } }, () => true, () => false), true);
for (const login of ["dependabot[bot]", "maintainer"]) {
  for (const action of ["opened", "synchronize", "reopened", "closed"]) {
    const github = { event_name: "pull_request", event: { action, pull_request: { user: { login } } } };
    const result = action === "closed" ? "skipped" : "success";
    assert.equal(publicationExpression(github, { validate: { result }, gate: { result } }, () => true, () => false), login !== "dependabot[bot]", `${login}: ${action} publication`);
    const validationExpression = new Function("github", `return (${entry.jobs.validate.if});`);
    assert.equal(validationExpression(github), action !== "closed", `${login}: ${action} validation`);
  }
}
const webUpload = workflow.jobs.web.steps.find(step => step.name === "Build and deploy");
assert.equal(webUpload.with.skip_app_build, true);
assert.equal(webUpload.with.app_location, "web/dist");
assert.equal(webUpload.with.output_location, "");
for (const configuration of [entry, ci, workflow]) {
  for (const job of Object.values(configuration.jobs)) {
    for (const step of job.steps ?? []) {
      if (step.uses) assert.match(step.uses, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/, `Unpinned action ${step.uses}`);
    }
  }
}
console.log("Release gates verified: one automatic validation, complete aggregate checks, isolated shards, immutable web artifact, protected publication ordering, and failure/skip/cleanup scenarios.");
