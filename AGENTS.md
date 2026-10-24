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

## Workflow

1. Read the owning project's guidance and relevant GitHub issue. Read the glossary before changing domain behavior or names. Use `rg` within the owner. Unit tests are colocated; API HTTP/PostgreSQL integration tests are in `api/test/`.
2. Before editing, create a fresh `codex/<task>-<unique-suffix>` branch. Use a separate worktree when needed to preserve unrelated work; commit only task changes.
3. For HTTP changes, follow [API contract generation/checking](api/README.md#openapi-contract), inspect affected paths/schemas and the mobile adapter, and validate API and mobile independently. Read [integration boundary](README.md#responsibilities) when changing client/server responsibilities.
4. Update owning documentation: shared terms in the glossary, implementation guidance in project docs, decisions in the owning ADR directory. Read [historical evidence](docs/archive/README.md) only for provenance; it is not current architecture or proof of passing checks.
5. Run project-required checks and `node scripts/local-test-launcher.mjs --api-postgres` from root. This command creates a fresh disposable PostgreSQL service, runs every required API database suite and removes only its own container/volume. Follow [local testing](docs/local-testing.md) for mobile checks and device/backend evidence. Commit, `git push -u origin <branch>`, and verify the remote contains the final commit.
6. Open the PR last with `gh pr create`; report its URL. Completion requires passing checks, the pushed final commit, and a PR. Report any blocked step. Retain the branch during review; delete locally/remotely after merging or explicit abandonment. Merge only when authorized.

Run installs/scripts in the owning project (`npm --prefix api ...` or `npm --prefix mobile-app ...`) except the root isolated PostgreSQL suite. Packages, lockfiles, dependencies and environments are project-local.

Native acceptance requires installable Android/iPhone builds, device evidence and the parser launch checks in issue [#138](https://github.com/yororo/spendeazy/issues/138). Lint, type checks and parser fixtures do not certify a native build or device behavior.

## Conditional references

- **Issues/specs:** use `gh` against this repository and [issue-tracker guidance](docs/agents/issue-tracker.md). Verify project-local historical issue references belong to this repository.
- **Triage:** use [triage labels](docs/agents/triage-labels.md).
- **Prebooted test services:** read [local test environment guidance](docs/local-testing.md#cloud-boot-environment) before replacing any prebooted database or API service. The isolated runner creates a uniquely named test database service and does not attach to existing services.
