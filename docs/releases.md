# Releases

## Validation and publication

Every normal main-push release, manual release, and web PR preview calls
`.github/workflows/ci.yml` from the same revision as the deployment workflow.
Only `.github/workflows/deploy.yml` subscribes to PR/main events; CI is reusable
or manually runnable, avoiding a second automatic validation of the same event.
All checkouts use the event SHA (the merge revision for PR previews). Validation
runs API/web lint, builds, unit suites, generated OpenAPI consistency, and the
isolated browser/API/PostgreSQL suite in parallel jobs. Browser coverage uses
two shards with independent environments and one worker per shard. API lint
checks without rewriting source. The caller preserves the required check name
`Validate projects and isolated browser suite`; it succeeds only after every
validation job and browser shard passes. Failed, canceled, skipped,
or incomplete validation cannot publish either project. Preview cleanup has no
validation dependency and runs on PR closure even after web changes are reverted.
Preview publication also requires the current head of an open PR, so rerunning an
older PR revision cannot replace a newer preview or recreate a closed preview.
The preview checks PR state/head again immediately before upload. CI builds web from `web/` with the deployment's public Vite variables and uploads `web/dist`, including
`staticwebapp.config.json`. Publication downloads the artifact by its immutable
ID from the same workflow run and skips Azure's frontend build. Artifact digest
mismatches fail the download. Artifacts and browser diagnostics expire after
seven days; rerun validation if a retained artifact has expired.

Changed paths select web/API independently. Main pushes compare each project
against its last successful Azure upload, including uploads in otherwise failed
runs. Skipped, failed, and verification-only publications do not advance that
baseline. History is fetched in compact pages to avoid subprocess output-buffer
failures, and both historical/current upload step names are recognized, including
jobs nested under the reusable publication workflow. If no publication is found
in the latest 100 main runs, publish that
project conservatively. This carries unpublished API changes into later web
releases even when an earlier run was canceled or superseded. Changes to workflow
files or the release scripts select both. PRs targeting `main` use their changed-file list to select web previews for web/workflow changes.
The web job accepts a skipped API job only after validation and change detection
succeed. An API failure or cancellation blocks web publication.

All production publications share one concurrency group in
`.github/workflows/publish.yml`, including manual runs. Validation runs outside
this lock. New PR/main revisions cancel obsolete validation through a separate
concurrency group; manual verification runs do not cancel each other. An active
publication finishes before another starts; pending publications may be replaced by
newer runs. GitHub does not guarantee queue order: after acquiring the publication lock, recheck that the source SHA is the current `main` tip. An old rerun or non-main manual publication fails this check.
Both-project releases complete API deployment before starting web publication.
Keep migration, API, and web jobs inside this shared publication workflow/lock.

## Deployment entry points and packaging

Use **Run workflow** on the root deployment workflow for manual `web`, `api`, or `all` publication; manual selections still validate both projects. API publication runs only on main pushes or manual runs. Root-only changes skip project publication when no unpublished project changes remain.

Deployment uses existing Azure/registry secrets. The API image uses `api/Dockerfile` with `api/` as its build context. Actions are pinned to release commits; Dependabot checks weekly for updates.

## API schema migrations

Every production API release uses a Docker Buildx container builder with a
project-scoped GitHub Actions layer cache, builds and pushes one API image, then
runs its
compiled migration entry point from that image in a temporary manual Azure
Container Apps job. The job uses only `DATABASE_URL`; it does not load Clerk,
web, or other application configuration. It waits for the migration process to
finish and confirms that TypeORM reports no pending migrations. API deployment
uses the same image digest that the migration job ran. The migration job
exports only that digest; deployment assembles the image reference in the deploy
job. A job output that includes the registry username is discarded because that
username is a secret. A failed or timed-out
migration blocks both API and web publication. The job is removed after the run,
including after a failed migration; the workflow also retries cleanup if the
runner is interrupted. A hard cancellation or Azure outage can leave a temporary
job to remove manually. Application startup never applies migrations.

The migration runner acquires a PostgreSQL session advisory lock before migrations and releases it after the schema-readiness check. Keep migrations additive and preserve compatibility with the
currently running API until the new API rollout succeeds.

Before enabling API publication, configure the `SPENDEAZYAPI2_DATABASE_URL`
GitHub Actions secret with the API database connection string, including the
same TLS options used by the API Container App. The migration job receives this as a job-scoped secret. The
`SPENDEAZYAPI2_AZURE_CLIENT_ID` federated identity must be allowed to create,
read, start, and delete Container Apps jobs in resource group `spendeazy-dev`,
and to use environment `managedEnvironment-spendeazydev-a6e6`. It also needs
the existing Docker Hub image pull credentials. These are deployment
prerequisites; verification-only runs do not use them.

If migration fails, inspect the Container Apps job execution logs and
`typeorm_migrations` before rerunning the release. Migrations currently run in
one transaction, but the database may have committed before a job failed to
report success. Keep recovery migrations safe to retry. Do not roll back the
database to match an older API; keep the additive schema and restore the old API
image if needed, then release a forward-fix migration. A rerun uses the same
schema history and skips already applied migrations. If a canceled workflow
leaves its temporary job behind, remove it with:

```sh
az containerapp job delete --name <job-name> --resource-group spendeazy-dev --yes
```

## Contract compatibility

API-first ordering does not make a breaking contract safe. Already-open browser
tabs, cached assets, and PR previews can continue using older web code. First
release an API that accepts old and new requests and keeps old response fields.
Then release web against the additive contract. Remove old behavior only in a
later release after the supported client lifetime and usage evidence justify it.
Use expand/backfill/contract migrations and retain compatibility during rollback.
Web-only publication is valid only against the deployed API; API-only publication
must continue supporting deployed and still-running web versions. Contract
artifact consistency and a same-revision suite do not prove cross-version support.

## Main enforcement

Main requires the caller's `Validate projects and isolated browser suite` aggregate check, restricted to the
GitHub Actions app (ID 15368), with strict up-to-date branch checking.
Administrator enforcement is enabled; force pushes and branch deletion are
disabled. This is live repository configuration, not a setting installed by YAML.
Verify it with:

```powershell
gh api repos/yororo/spendeazy/branches/main/protection
gh api repos/yororo/spendeazy/rulesets
```

Check `required_status_checks.strict`, the check's `app_id`, and
`enforce_admins.enabled`. Recheck after policy changes. Do not use an administrator
bypass to release a failing revision.

## Safe workflow verification

Manual `verify_only=true` runs exercise the actual validation and deployment job
dependencies while skipping every Azure login/upload step. They may run on a
review branch. `fail_validation=true` deliberately fails validation only when
`verify_only=true`; it cannot bypass or weaken a real publication gate.

```powershell
gh workflow run deploy.yml --ref <review-branch> -f project=all -F verify_only=true -F fail_validation=true
gh workflow run deploy.yml --ref <review-branch> -f project=all -F verify_only=true
gh workflow run deploy.yml --ref <review-branch> -f project=web -F verify_only=true
gh workflow run deploy.yml --ref <review-branch> -f project=api -F verify_only=true
```

Confirm the failed run skips both publication jobs; the successful `all` run
starts web after API finishes; and the single-project runs skip the other job
without suppressing the selected job. Migration is skipped in verification
mode, while an actual API release must complete it before API publication.
Verification logs name the source SHA.
These runs demonstrate orchestration, not an Azure deployment. Report live
validation, verification, preview, and production results separately.
