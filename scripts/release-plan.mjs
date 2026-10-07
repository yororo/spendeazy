import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const uploadSteps = {
  web: ["Build and deploy"],
  api: ["Deploy migration-tested container image", "Build and deploy container image"],
};
const sharedReleasePaths = [
  "scripts/release-plan.mjs",
  "scripts/verify-release-gates.mjs",
  "scripts/run-api-migration-job.mjs",
];
const runFields = "{workflow_runs: [.workflow_runs[] | {id, status, event, head_sha}]}";
const jobFields = "{jobs: [.jobs[] | {name, steps: [(.steps // [])[] | {name, conclusion}]}]}";

// Filter in gh before its response enters Node's bounded output buffer.
function readPage(path, fields) {
  return JSON.parse(execFileSync("gh", ["api", path, "--jq", fields], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  }));
}

export function findPublishedRevisions(repository, fetchPage = readPage) {
  const published = {};
  // Bound history to the latest 100 main runs, fetched in small pages.
  for (let page = 1; page <= 5; page += 1) {
    const { workflow_runs: runs } = fetchPage(
      `repos/${repository}/actions/workflows/deploy.yml/runs?branch=main&per_page=20&page=${page}`,
      runFields,
    );
    for (const run of runs) {
      if (run.status !== "completed" || !["push", "workflow_dispatch"].includes(run.event)) continue;
      for (let jobPage = 1; ; jobPage += 1) {
        const { jobs } = fetchPage(
          `repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=50&page=${jobPage}`,
          jobFields,
        );
        for (const project of ["web", "api"]) {
          const jobName = `Build and deploy ${project === "api" ? "API" : "web"}`;
          if (!published[project] && jobs.some(job =>
            (job.name === jobName || job.name.endsWith(` / ${jobName}`)) &&
            job.steps.some(step => uploadSteps[project].includes(step.name) && step.conclusion === "success"),
          )) published[project] = run.head_sha;
        }
        if ((published.web && published.api) || jobs.length < 50) break;
      }
      if (published.web && published.api) return published;
    }
    if (runs.length < 20) break;
  }
  return published;
}

export function projectNeedsPublication(project, baseline, changedFiles) {
  return !baseline || changedFiles.some(path =>
    path.startsWith(`${project}/`) || path.startsWith(".github/workflows/") || sharedReleasePaths.includes(path),
  );
}

function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const revision = process.env.GITHUB_SHA;
  if (!repository || !revision || !process.env.GITHUB_OUTPUT) throw new Error("Release planning requires GitHub Actions context.");
  const published = findPublishedRevisions(repository);
  for (const project of ["web", "api"]) {
    const baseline = published[project];
    const files = baseline ? execFileSync("git", ["diff", "--name-only", "-z", baseline, revision], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    }).split("\0") : [];
    const changed = projectNeedsPublication(project, baseline, files);
    appendFileSync(process.env.GITHUB_OUTPUT, `${project}=${changed}\n`);
    console.log(`${project}: ${changed ? "publish" : "unchanged"}; last successful upload ${baseline ?? "unknown"}; source ${revision}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
