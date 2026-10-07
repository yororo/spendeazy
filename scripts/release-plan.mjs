import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const repository = process.env.GITHUB_REPOSITORY;
const revision = process.env.GITHUB_SHA;
if (!repository || !revision || !process.env.GITHUB_OUTPUT) throw new Error("Release planning requires GitHub Actions context.");
const api = path => JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
const runs = api(`repos/${repository}/actions/workflows/deploy.yml/runs?branch=main&per_page=100`).workflow_runs;
const published = {};
const uploadSteps = { web: "Build and deploy", api: "Build and deploy container image" };

// Inspect actual upload steps, including successful API publication in a run
// whose later web job failed. Verification-only runs never count as publication.
for (const run of runs) {
  if (run.status !== "completed" || !["push", "workflow_dispatch"].includes(run.event)) continue;
  const jobs = api(`repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`).jobs;
  for (const project of ["web", "api"]) {
    if (!published[project] && jobs.some(job => job.name === `Build and deploy ${project === "api" ? "API" : "web"}` && job.steps.some(step => step.name === uploadSteps[project] && step.conclusion === "success"))) {
      published[project] = run.head_sha;
    }
  }
  if (published.web && published.api) break;
}

for (const project of ["web", "api"]) {
  const baseline = published[project];
  // No trustworthy publication in the retained history: publish conservatively.
  const files = baseline ? execFileSync("git", ["diff", "--name-only", "-z", baseline, revision], { encoding: "utf8" }).split("\0") : [];
  const changed = !baseline || files.some(path => path.startsWith(`${project}/`) || [".github/workflows/deploy.yml", ".github/workflows/ci.yml", "scripts/release-plan.mjs", "scripts/verify-release-gates.mjs"].includes(path));
  appendFileSync(process.env.GITHUB_OUTPUT, `${project}=${changed}\n`);
  console.log(`${project}: ${changed ? "publish" : "unchanged"}; last successful upload ${baseline ?? "unknown"}; source ${revision}`);
}
