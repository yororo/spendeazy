# Working in Spendeazy

Spendeazy is one personal-finance product with two independently built npm projects. Root guidance applies throughout; project `AGENTS.md` files add local instructions. Paths in project docs are relative to that project unless stated otherwise.

## Choose the project

| Work | Start here | Guidance |
| --- | --- | --- |
| Browser UI, routing, client queries, PDF parsing/reconciliation, Statement Import review and Category Rule matching | `web/` | [web/AGENTS.md](web/AGENTS.md) |
| REST endpoints, authentication/ownership enforcement, persistence, migrations, duplicate checks and atomic import commits | `api/` | [api/AGENTS.md](api/AGENTS.md) |
| Contracts or behavior spanning browser and server | Both | Read both projects' guidance and inspect the web adapter and API endpoint together |
| Shared vocabulary or repository workflow | Root | [Domain documentation](docs/agents/domain.md) |

## Coding workflow

1. **Read the requirements.** Use the owning project guidance above, [GLOSSARY.md](GLOSSARY.md) before changing behavior, and the relevant GitHub issue when one exists (see Issue workflow below).
2. **Create a branch.** Before editing code, create a fresh temporary `codex/<task>-<unique-suffix>` branch for each task. Use a separate worktree when needed to preserve unrelated work; keep only the task's code and supporting changes on its branch.
3. **Locate the implementation and tests.** Start with the [web task map](web/docs/ARCHITECTURE.md#task-entry-points) or [API task map](api/ARCHITECTURE.md#task-entry-points), then use `rg` within the owning feature or infrastructure tree. Unit tests are colocated; search `web/e2e/` or `api/test/` explicitly for integration coverage.
4. **Implement across affected boundaries.** The browser calls the API over HTTP; read [README.md](README.md) for integration and startup. For contract changes, inspect API DTO/controller metadata, the affected paths and referenced schemas in `api/docs/openapi.yaml`, and web adapters together. Follow the [API README](api/README.md) for contract generation/checking, update affected adapters, and validate both projects. Keep YAML canonical in the API; use generated `api/docs/openapi.json` only for JSON tooling.
5. **Update documentation.** Keep shared terms in root `GLOSSARY.md`, implementation guidance in project docs, and decisions in the owning project's `docs/adr/`. Load [historical evidence](docs/archive/README.md) or skill references only when needed for provenance or workflow; historical notes are not current architecture or proof of passing checks.
6. **Validate, commit, and push.** Run the owning project's required checks, then run `node scripts/local-test-launcher.mjs --e2e` from root. Fix failures; see [local synthetic testing](docs/local-testing.md) for prerequisites and troubleshooting. After checks pass, commit only the task's changes, run `git push -u origin <branch>`, and verify the remote contains the final commit.
7. **Open the PR as the final step.** Run `gh pr create` and report its URL. Completion requires passing checks, the pushed final commit, and a GitHub PR; report blockers if any step cannot finish.

Run installs, scripts, tests, and builds in the owning project, except the root isolated suite above. Each project has its own package, lockfile, dependencies, and environment; from root, use `npm --prefix web ...` or `npm --prefix api ...`.

Retain the branch during review; delete it locally and on GitHub after merging or explicit abandonment. Merge only when authorized.

## Issue workflow

Issues and specs live in GitHub Issues; use `gh` and [issue-tracker guidance](docs/agents/issue-tracker.md). When triaging, use [the repository's triage labels](docs/agents/triage-labels.md). Run `gh` against this repository; older project-local issue references may refer to pre-monorepo history, so verify their repository before acting.
