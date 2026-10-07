import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../api/package.json", import.meta.url));
const { load } = require("js-yaml");
const workflow = load(readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8"));

// Evaluate the actual workflow conditions against release scenarios. This does
// not replace GitHub execution; it makes failure and skip combinations reviewable.
function permitted(job, { event = "workflow_dispatch", project = "all", validation = "success", changes = "success", api = "success", webChanged = "true", apiChanged = "true", cancelled = false, action = "opened" } = {}) {
  const needs = {
    validate: { result: validation },
    changes: { result: changes, outputs: { web: webChanged, api: apiChanged } },
    api: { result: api },
  };
  // GitHub applies success() implicitly unless a status function is explicit.
  const expression = workflow.jobs[job].if;
  if (!expression.includes("always()") && (validation !== "success" || changes !== "success" || cancelled)) return false;
  return Boolean(new Function("github", "inputs", "needs", "always", "cancelled", `return (${expression});`)(
    { event_name: event, event: { action } }, { project }, needs, () => true, () => cancelled,
  ));
}

for (const validation of ["failure", "cancelled", "skipped", "pending", "in_progress"]) {
  for (const job of ["web", "api"]) assert.equal(permitted(job, { validation }), false, `${job}: ${validation} validation`);
}
for (const changes of ["failure", "cancelled", "skipped"]) {
  for (const job of ["web", "api"]) assert.equal(permitted(job, { changes }), false);
}
for (const api of ["failure", "cancelled", "pending"]) assert.equal(permitted("web", { api }), false);
for (const job of ["web", "api"]) assert.equal(permitted(job, { cancelled: true }), false);
for (const [project, web, api] of [["all", true, true], ["web", true, false], ["api", false, true]]) {
  assert.equal(permitted("api", { project }), api);
  assert.equal(permitted("web", { project, api: api ? "success" : "skipped" }), web);
}
for (const [webChanged, apiChanged, web, api] of [["true", "true", true, true], ["true", "false", true, false], ["false", "true", false, true], ["false", "false", false, false]]) {
  const scenario = { event: "push", webChanged, apiChanged, api: api ? "success" : "skipped" };
  assert.equal(permitted("api", scenario), api);
  assert.equal(permitted("web", scenario), web);
}
assert.equal(permitted("web", { event: "pull_request", api: "skipped" }), true);
assert.equal(permitted("api", { event: "pull_request" }), false);
assert.equal(permitted("web", { event: "pull_request", action: "closed", api: "skipped" }), false);
assert.equal(workflow.jobs.close_web_preview.needs, undefined);
assert.deepEqual(workflow.jobs.web.needs, ["changes", "validate", "api"]);
assert.deepEqual(workflow.jobs.api.needs, ["changes", "validate"]);
assert.equal(workflow.jobs.validate.uses, "./.github/workflows/ci.yml");
assert.equal(workflow.concurrency["cancel-in-progress"], false);
console.log("Release conditions verified: failure/cancellation/incomplete gates, API ordering, previews/cleanup, manual and path selections.");
