import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../api/package.json", import.meta.url));
const { load } = require("js-yaml");
const workflow = load(readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8"));

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
    { event_name: event, event: { action } }, { project, verify_only: verifyOnly }, needs, () => true, () => cancelled,
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
assert.deepEqual(workflow.jobs.web.needs, ["changes", "validate", "migrate", "api"]);
assert.deepEqual(workflow.jobs.api.needs, ["changes", "validate", "migrate"]);
assert.deepEqual(workflow.jobs.migrate.needs, ["changes", "validate"]);
assert.equal(workflow.jobs.validate.uses, "./.github/workflows/ci.yml");
assert.equal(workflow.concurrency["cancel-in-progress"], false);
console.log("Release conditions verified: migration failure blocks API/web, migration precedes deployment, previews, verify-only runs, and project/path selections.");
