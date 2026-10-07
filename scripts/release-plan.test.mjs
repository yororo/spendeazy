import assert from "node:assert/strict";
import test from "node:test";
import { findPublishedRevisions, projectNeedsPublication } from "./release-plan.mjs";

const run = (id, event = "push", status = "completed") => ({ id, event, status, head_sha: `revision-${id}` });
const upload = (project, step, conclusion = "success", prefix = "") => ({
  name: `${prefix}Build and deploy ${project}`,
  steps: [{ name: step, conclusion }],
});

test("successful API upload advances its baseline even when later web publication fails", () => {
  const published = findPublishedRevisions("owner/repo", path => path.includes("/jobs?")
    ? { jobs: [upload("API", "Deploy migration-tested container image", "success", "publish / "), upload("web", "Build and deploy", "failure")] }
    : { workflow_runs: [run(3)] });
  assert.deepEqual(published, { api: "revision-3" });
});

test("verification, previews, incomplete runs, and failed uploads never advance the baseline", () => {
  const fetchedJobs = [];
  const published = findPublishedRevisions("owner/repo", path => {
    if (!path.includes("/jobs?")) return { workflow_runs: [run(5, "pull_request"), run(4, "push", "in_progress"), run(3, "workflow_dispatch"), run(2), run(1)] };
    fetchedJobs.push(path);
    if (path.includes("/3/")) return { jobs: [upload("API", "Verify API publication gate"), upload("web", "Verify web publication gate")] };
    if (path.includes("/2/")) return { jobs: [upload("API", "Deploy migration-tested container image", "failure"), upload("web", "Build and deploy", "skipped")] };
    return { jobs: [upload("API", "Build and deploy container image"), upload("web", "Build and deploy")] };
  });
  assert.deepEqual(published, { api: "revision-1", web: "revision-1" });
  assert.equal(fetchedJobs.length, 3);
});

test("pagination finds older successful uploads and jobs beyond the first page", () => {
  const requests = [];
  const published = findPublishedRevisions("owner/repo", (path, fields) => {
    requests.push({ path, fields });
    if (path.includes("/workflows/")) return { workflow_runs: path.endsWith("page=1")
      ? Array.from({ length: 20 }, (_, index) => run(100 - index, "pull_request")) : [run(1)] };
    return { jobs: path.endsWith("page=1")
      ? Array.from({ length: 50 }, () => ({ name: "validation", steps: [] }))
      : [upload("API", "Deploy migration-tested container image"), upload("web", "Build and deploy")] };
  });
  assert.deepEqual(published, { api: "revision-1", web: "revision-1" });
  assert.equal(requests.length, 4);
});

test("unknown history publishes conservatively and shared migration changes select both projects", () => {
  for (const project of ["web", "api"]) {
    assert.equal(projectNeedsPublication(project, undefined, []), true);
    assert.equal(projectNeedsPublication(project, "published", ["scripts/run-api-migration-job.mjs"]), true);
    assert.equal(projectNeedsPublication(project, "published", [".github/workflows/publish.yml"]), true);
    assert.equal(projectNeedsPublication(project, "published", ["docs/releases.md"]), false);
  }
  assert.equal(projectNeedsPublication("web", "published", ["api/src/main.ts"]), false);
  assert.equal(projectNeedsPublication("api", "published", ["web/src/main.tsx"]), false);
});
