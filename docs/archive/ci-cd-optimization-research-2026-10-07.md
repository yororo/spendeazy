# CI/CD optimization source research

Research date: 2026-10-07. Historical investigation; no workflow implementation changes are included. Recheck against current workflows before applying recommendations.

## Repository observations

- `ci.yml` directly subscribes to pushes and pull requests targeting `main`; `deploy.yml` subscribes to the same events and calls `ci.yml` through `workflow_call`. Thus each applicable event executes the full validation twice. The second invocation is a new execution, not reuse of the first run's result. The duplication occurs separately on PR activity and on the merged `main` push.
- Deployment has a workflow-wide non-cancelling release lock, including validation. Standalone CI has no concurrency cancellation. Rapid PR updates can consume validation time for obsolete revisions.
- CI builds the web application without the deployment step's `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL`. Azure builds it again. `web/public/staticwebapp.config.json` is the configuration source.
- `scripts/verify-release-gates.mjs` explicitly asserts the current workflow call and dependency graph. Any approved restructuring must update the gate verification together with the workflows.

## Recommendations and primary-source constraints

### 1. Give validation one automatic event owner

Prefer keeping the current deployment orchestration as the automatic caller and making CI reusable/manual only, or moving the orchestration into one event-owning CI workflow. Keep one full validation per PR revision and one per merged `main` revision. The post-merge run remains useful because it validates the actual revision being published. A reusable workflow centralizes logic but does not deduplicate separately triggered executions. [GitHub reusable workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations).

Before removing an automatically triggered check, inspect the repository's required checks/rulesets and preserve or deliberately migrate the required check identity. Required checks must pass for the relevant revision. [GitHub required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

### 2. Cancel obsolete validation while keeping publication protected

Use a validation-specific concurrency group per PR/branch with `cancel-in-progress: true`. Preserve non-cancelling serialization across API migration, API deployment, and web publication. This is an architectural recommendation: cancellation saves stale compute, while the existing migration/publication ordering protects release consistency. Avoid indiscriminately cancelling the complete deployment workflow, which could interrupt an upload or migration.

GitHub supports separate job/workflow concurrency and conditional cancellation. Group names must be unique across scopes. With reusable workflows, identical caller/callee cancelling groups can cancel the caller because the called workflow inherits the caller's `github.workflow` value. [GitHub concurrency controls](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [reusable workflow concurrency caveat](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations).

Current GitHub documentation also describes `queue: max`; it is unnecessary for a latest-main release policy and incompatible with cancelling active runs. Keep the existing release planner's unpublished-change recovery when superseding pending production runs.

### 3. Build the deployable web artifact once

Build with the real public deployment variables in the validated build job, transfer the resulting `web/dist` artifact to publication, and configure Azure with `app_location: web/dist`, `skip_app_build: true`, and `output_location: ''`. Ensure `staticwebapp.config.json` is present in the deployed output. This removes the redundant Azure frontend build and aligns the published output with validation. [Microsoft prebuilt frontend deployment](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration#skip-building-front-end-app).

Do not blindly upload the existing CI build: Vite substitutes environment values at build time, and current CI does not provide deployment's two `VITE_*` variables. The build must receive the appropriate public values for its target environment; verify configuration content in the artifact. [Vite environment documentation](https://vite.dev/guide/env-and-mode.html).

### 4. Filter jobs without making required workflows disappear

If approved, retain an always-present aggregate validation gate and use changed-path detection to decide optional jobs. GitHub states that a workflow skipped by path/branch filtering leaves its check pending; a job skipped conditionally reports success. Therefore adding top-level `paths` to a required validation workflow can block merges. The aggregate gate must explicitly fail for failed or cancelled required jobs, rather than accept skipped dependencies accidentally. Preserve full cross-project browser/API/PostgreSQL coverage on changes affecting either application or its shared test infrastructure. [GitHub required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

## Evidence limits

These findings establish documented behavior and implementation opportunities, not measured performance savings. Workflow run/step timing and repository ruleset inspection should determine prioritization and the exact required-check migration before implementation. The user's confirmation is required before changing the workflow implementation.
