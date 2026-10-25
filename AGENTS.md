# Working in Spendeazy

One product, two independently built npm projects: a native mobile app and a REST API. This file owns repository policy; project `AGENTS.md` files add local guidance. Paths in project documents are relative to that project unless stated otherwise.

## Choose the project

| Task | Guidance / implementation map |
| --- | --- |
| Mobile UI, routing, local PDF parsing/review, Category Rule matching | [Mobile guidance](mobile-app/AGENTS.md), [mobile README](mobile-app/README.md) |
| REST, authentication/authorization, persistence, migrations, duplicates, atomic import commits | [API guidance](api/AGENTS.md), [API task map](api/ARCHITECTURE.md#task-entry-points) |
| HTTP contract or behavior spanning app/server | Read both project guides; inspect the mobile adapter and API endpoint together |
| Domain naming or durable decisions | [GLOSSARY.md](GLOSSARY.md), [domain/ADR ownership](docs/agents/domain.md) |

`web/` source and hosting are retired. The retained `web/design/` files are visual references only and must not regain build, test or deployment jobs without a new decision.

## Cross-project documentation

When a document in one project describes the other, cite that project's stable published surface. Source paths and code samples stay in the owning project; implementation files move. Mobile documents describe API features by the exposed endpoints in the [OpenAPI contract](api/docs/openapi.yaml), the source of truth for shipped API behavior.

## Workflow when implementing code changes

1. Switch to the `main` branch if in a different branch, and get the latest commits `git pull`.
2. Read the owning project's guidance and relevant GitHub issue. Read the glossary before changing domain behavior or names. Use `rg` within the owner.
3. Before editing, create a fresh `dev/<task>-<unique-suffix>` branch. Commit only task changes.
4. Update owning documentation if there are changes in shared terms in the glossary, implementation guidance in project docs, and decisions in the owning ADR directory.
5. Run project-required checks and tests. Commit, `git push -u origin <branch>`, and verify the remote contains the final commit.
6. Open the PR last with `gh pr create`; report its URL. Completion requires passing checks, the pushed final commit, and a PR. Report any blocked step. Retain the branch during review; delete locally/remotely after merging or explicit abandonment. Merge only when authorized.

Run installs/scripts in the owning project (`npm --prefix api ...` or `npm --prefix mobile-app ...`) except the root isolated PostgreSQL suite. Packages, lockfiles, dependencies and environments are project-local.

Native acceptance requires installable Android/iPhone builds, device evidence and the parser launch checks in issue [#138](https://github.com/yororo/spendeazy/issues/138). Lint, type checks and parser fixtures do not certify a native build or device behavior.

## Conditional references

- **Issues/specs:** use `gh` against this repository and [issue-tracker guidance](docs/agents/issue-tracker.md). Verify project-local historical issue references belong to this repository.
- **Triage:** use [triage labels](docs/agents/triage-labels.md).
- **Local manual testing:** first-time setup, API/database startup, native install/reload, device checks, shutdown and reset — [local runbook](docs/local-testing.md). Humans and agents follow the same steps and report observed results. Existing software checks — [local checks](docs/local-checks.md).

## Cursor Cloud environment

Node.js 24.11.1 is installed at `/usr/local/lib/nodejs`; prepend its `bin` to `PATH` if the shell selects another version. The Android SDK is at `/opt/android-sdk`; set `ANDROID_HOME` and `ANDROID_SDK_ROOT` accordingly. The `spendeazy` AVD uses a Google Play image. This host requires software emulation (no KVM); boot can take about ten minutes. Confirm `adb shell getprop sys.boot_completed` prints `1`. Use the same local runbook once Docker and the emulator are available; the emulator reaches the host API at `10.0.2.2`.
