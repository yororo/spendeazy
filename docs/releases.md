# Releases

## Validation and publication

`.github/workflows/deploy.yml` is the deployment entry point. It invokes reusable `.github/workflows/ci.yml` validation for pull requests and main pushes; CI can also be run manually. The aggregate check is `Validate API, PostgreSQL and mobile`. Validation has independent API/PostgreSQL and native-mobile jobs. The API job builds, lints without rewriting, runs unit tests, requires every HTTP/PostgreSQL suite against its own database (with a separate historical-migration database), and checks the committed OpenAPI artifacts. The mobile job runs lint, TypeScript, and parser-fixture checks. No browser application, preview, artifact, or browser acceptance suite participates in delivery.

API publication is the only production publication. Main pushes publish only when API source or delivery inputs differ from the last successful API publication; missing history selects publication conservatively. Mobile-only changes do not publish the API. Workflow and release-script changes select API publication. History recognizes previous deploy steps and checks compact pages. Failed, canceled, skipped, or incomplete validation cannot publish. Verification-only publications remain Azure-free.

All production publications share one concurrency group in `.github/workflows/publish.yml`. Validation runs outside the lock. After acquiring the lock, publication verifies that its source SHA is the current `main` tip. Older reruns and non-main manual publications fail this check. The API image is built once; the migration job runs from its digest, and deployment uses that same digest. A failed or timed-out migration blocks API deployment.

## Deployment entry points and packaging

Use **Run workflow** on the root deployment workflow for manual API publication. Manual runs validate both API and mobile projects. Root-only and mobile-only changes do not publish API when no unpublished API changes remain.

Deployment uses existing Azure/registry secrets. The image uses `api/Dockerfile` with `api/` as its build context. Actions are pinned to release commits; Dependabot checks weekly for updates.

## API schema migrations

Every production API release builds and pushes one API image, then runs its compiled migration entry point from that image in a temporary manual Azure Container Apps job. The job uses only `DATABASE_URL`; it does not load Clerk or client configuration. It waits for migration completion and confirms that TypeORM reports no pending migrations. API deployment uses the same image digest that the migration job ran. A failed or timed-out migration blocks publication. The temporary job is removed after the run; a hard cancellation or Azure outage can leave a job to remove manually. Application startup never applies migrations.

The migration runner acquires a PostgreSQL session advisory lock before migrations and releases it after the schema-readiness check. Keep migrations additive and compatible with the currently running API until the new API rollout succeeds.

Before enabling API publication, configure `SPENDEAZYAPI2_DATABASE_URL` with the API database connection string and required TLS options. The migration job receives it as a job-scoped secret. `SPENDEAZYAPI2_AZURE_CLIENT_ID` needs permission to create, read, start, and delete Container Apps jobs in resource group `spendeazy-dev`, to use environment `managedEnvironment-spendeazydev-a6e6`, and to use existing Docker Hub image-pull credentials. Verification-only runs do not use these secrets.

If migration fails, inspect the Container Apps job execution logs and `typeorm_migrations` before rerunning. A database may have committed before a job failed to report success. Keep recovery migrations safe to retry. Do not roll the database back to match an older API; restore the old API image if needed, then release a forward-fix migration. A rerun uses the same schema history and skips applied migrations. Remove an orphaned temporary job with:

```sh
az containerapp job delete --name <job-name> --resource-group spendeazy-dev --yes
```

## Mobile release evidence

The mobile app is not yet a completed client for the accepted Expense contract. Completion requires a native build; supported-device behavior, data-flow review and parser limits remain separate acceptance work. [Issue #138](https://github.com/yororo/spendeazy/issues/138) remains a launch gate for parser limits, older-device support and temporary-file cleanup. Android emulator and physical iPhone observations are evidence inputs, not a substitute for completing those gates. Lint and type checks do not establish device certification.

## Main enforcement

Main requires `Validate API, PostgreSQL and mobile`, restricted to the GitHub Actions app (ID 15368), with strict up-to-date branch checking. Administrator enforcement is enabled; force pushes and branch deletion are disabled. This is live repository configuration, not a setting installed by YAML. Verify it with:

```powershell
gh api repos/yororo/spendeazy/branches/main/protection
gh api repos/yororo/spendeazy/rulesets
```

Check `required_status_checks.strict`, the required check's `app_id`, and `enforce_admins.enabled`. Recheck after policy changes. Do not use an administrator bypass to release a failing revision.

## Safe workflow verification

Manual `verify_only=true` runs exercise the actual validation and deployment dependencies while skipping Azure login and publication. They may run on a review branch. `fail_validation=true` deliberately fails validation only when `verify_only=true`; it cannot bypass or weaken a real publication gate.

```powershell
gh workflow run deploy.yml --ref <review-branch> -F verify_only=true -F fail_validation=true
gh workflow run deploy.yml --ref <review-branch> -F verify_only=true
```

Confirm the deliberate failure skips API publication and the successful run skips every Azure step. These runs demonstrate orchestration, not an Azure deployment. Report live validation, verification, and production results separately.
