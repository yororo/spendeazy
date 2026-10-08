# Working in Spendeazy

One product, two independently built npm projects. This file owns repository policy; project `AGENTS.md` files add local guidance. Project-document paths are relative to that project unless stated otherwise.

## Choose the project

| Task | Guidance / implementation map |
| --- | --- |
| Browser UI, routing, queries, PDF parsing/reconciliation, import review, Category Rule matching | [Web guidance](web/AGENTS.md), [web task map](web/docs/ARCHITECTURE.md#task-entry-points) |
| REST, authentication/authorization, persistence, migrations, duplicates, atomic import commits | [API guidance](api/AGENTS.md), [API task map](api/ARCHITECTURE.md#task-entry-points) |
| HTTP contracts or behavior spanning browser/server | Read both project guides; inspect the web adapter and API endpoint together |
| Domain naming or durable decisions | [GLOSSARY.md](GLOSSARY.md), [domain/ADR ownership](docs/agents/domain.md) |

## Workflow

1. Read the owning project's guidance and relevant GitHub issue. Read the glossary before changing domain behavior or names. Use `rg` within the owner. Unit tests are colocated; integration tests are in `api/test/` and `web/e2e/`.
2. Before editing, create a fresh `codex/<task>-<unique-suffix>` branch. Use a separate worktree when needed to preserve unrelated work; commit only task changes.
3. For HTTP changes, follow [API contract generation/checking](api/README.md#openapi-contract), inspect affected paths/schemas and web adapters, and validate both projects. Read [integration](README.md#integration-boundary) when changing browser/server responsibilities.
4. Update the owning documentation: shared terms in the glossary, implementation guidance in project docs, decisions in the owning ADR directory. Read [historical evidence](docs/archive/README.md) only for provenance; it is not current architecture or proof of passing checks.
5. Run project-required checks and `node scripts/local-test-launcher.mjs --e2e` from root; fix failures. [Synthetic testing](docs/local-testing.md) owns prerequisites and troubleshooting. Commit, `git push -u origin <branch>`, and verify the remote contains the final commit.
6. Open the PR last with `gh pr create`; report its URL. Completion requires passing checks, the pushed final commit, and a PR. Report any blocked step. Retain the branch during review; delete locally/remotely after merging or explicit abandonment. Merge only when authorized.

Run installs/scripts in the owning project (`npm --prefix api ...` or `npm --prefix web ...` from root), except the root isolated suite. Packages, lockfiles, dependencies, and environments are project-local.

## Conditional references

- **Issues/specs:** use `gh` against this repository and [issue-tracker guidance](docs/agents/issue-tracker.md). Verify project-local historical issue references belong to this repository.
- **Triage:** use [triage labels](docs/agents/triage-labels.md).
- **Cursor Cloud:** read [cloud boot guidance](docs/local-testing.md#cloud-boot-environment) before starting or replacing the prebooted synthetic stack.
