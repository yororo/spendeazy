# Releases

## Validation and publication

Every normal main-push release, manual release, and web PR preview calls
`.github/workflows/ci.yml` from the same revision as the deployment workflow.
All checkouts use the event SHA (the merge revision for PR previews). Validation
runs API/web lint, builds, unit suites, generated OpenAPI consistency, and the
isolated browser/API/PostgreSQL suite. API lint checks without rewriting source.
Only a successful validation job permits publication. Failed, canceled, skipped,
or incomplete validation cannot publish either project. Preview cleanup has no
validation dependency and runs on PR closure even after web changes are reverted.

Changed paths select web/API independently. Main pushes compare each project
against its last successful Azure upload, including uploads in otherwise failed
runs. Skipped, failed, and verification-only publications do not advance that
baseline. If no publication is found in the latest 100 main runs, publish that
project conservatively. This carries unpublished API changes into later web
releases even when an earlier run was canceled or superseded. Changes to either
workflow or the release scripts select both. PRs use their changed-file list and
publish only web previews; manual runs select `all`, `web`, or `api`.
The web job accepts a skipped API job only after validation and change detection
succeed. An API failure or cancellation blocks web publication.

All production runs share one workflow concurrency group, including manual runs.
An active run finishes before another starts; pending runs may be replaced by
newer runs. GitHub does not guarantee queue order, so each production run also
checks that its SHA is the current `main` tip before it can publish. An old rerun
or non-main manual publication fails this check. New main commits arriving during
an active release wait for its lock; they cannot finish publication before it.
Both-project releases complete API deployment before starting web publication.
Do not split the jobs into separate production concurrency groups.

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

Main requires `Validate projects and isolated browser suite`, restricted to the
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
without suppressing the selected job. Verification logs name the source SHA.
These runs demonstrate orchestration, not an Azure deployment. Report live
validation, verification, preview, and production results separately.
