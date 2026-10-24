import assert from "node:assert/strict";
import test from "node:test";
import { apiNeedsPublication, findLastApiPublication } from "./release-plan.mjs";

const run = (id, event = "push", status = "completed") => ({ id, event, status, head_sha: `revision-${id}` });
const deployment = (step, conclusion = "success") => ({
  name: "Build and deploy API",
  steps: [{ name: step, conclusion }],
});

test("the latest successful API deployment advances its baseline", () => {
  const revision = findLastApiPublication("owner/repo", path => path.includes("/jobs?")
    ? { jobs: [deployment("Deploy migration-tested container image")] }
    : { workflow_runs: [run(3)] });
  assert.equal(revision, "revision-3");
});

test("verification runs, open pull requests, incomplete runs, and failed deploys do not advance the baseline", () => {
  const fetchedJobs = [];
  const revision = findLastApiPublication("owner/repo", path => {
    if (!path.includes("/jobs?")) return { workflow_runs: [run(5, "pull_request"), run(4, "push", "in_progress"), run(3, "workflow_dispatch"), run(2), run(1)] };
    fetchedJobs.push(path);
    if (path.includes("/3/")) return { jobs: [{ ...deployment("Verify API publication gate"), name: "Build and deploy API" }] };
    if (path.includes("/2/")) return { jobs: [deployment("Deploy migration-tested container image", "failure")] };
    return { jobs: [deployment("Deploy migration-tested container image")] };
  });
  assert.equal(revision, "revision-1");
  assert.equal(fetchedJobs.length, 3);
});

test("pagination finds older successful deployments and jobs beyond the first page", () => {
  const requests = [];
  const revision = findLastApiPublication("owner/repo", (path, fields) => {
    requests.push({ path, fields });
    if (path.includes("/workflows/")) return { workflow_runs: path.endsWith("page=1")
      ? Array.from({ length: 20 }, (_, index) => run(100 - index, "pull_request")) : [run(1)] };
    return { jobs: path.endsWith("page=1")
      ? Array.from({ length: 50 }, () => ({ name: "validation", steps: [] }))
      : [deployment("Deploy migration-tested container image")] };
  });
  assert.equal(revision, "revision-1");
  assert.equal(requests.length, 4);
});

test("unknown deployment history selects API and mobile changes do not trigger an API deployment", () => {
  assert.equal(apiNeedsPublication(undefined, []), true);
  assert.equal(apiNeedsPublication("published", ["scripts/run-api-migration-job.mjs"]), true);
  assert.equal(apiNeedsPublication("published", [".github/workflows/publish.yml"]), true);
  assert.equal(apiNeedsPublication("published", ["docs/releases.md"]), false);
  assert.equal(apiNeedsPublication("published", ["api/src/main.ts"]), true);
  assert.equal(apiNeedsPublication("published", ["mobile-app/src/app/index.tsx"]), false);
});
