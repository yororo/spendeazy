# Working in Spendeazy

Spendeazy is one personal-finance product with two independently built npm projects. Read [CONTEXT.md](CONTEXT.md) for shared domain language before changing behavior.

## Choose the project

| Work | Start here | Guidance |
| --- | --- | --- |
| Browser UI, routing, client queries, PDF parsing/reconciliation, Statement Import review and Category Rule matching | `web/` | [web/AGENTS.md](web/AGENTS.md) |
| REST endpoints, authentication/ownership enforcement, persistence, migrations, duplicate checks and atomic import commits | `api/` | [api/AGENTS.md](api/AGENTS.md) |
| Contracts or behavior spanning browser and server | Both | Read both projects' guidance and inspect the web adapter and API endpoint together |
| Shared vocabulary or repository workflow | Root | [Domain documentation](docs/agents/domain.md) |

## Working boundaries

- Root guidance applies throughout the repository; project `AGENTS.md` files add local instructions. Paths in project documentation are relative to that project unless stated otherwise.
- Run installs, scripts, tests, and builds in the owning project. Each has its own `package.json`, lockfile, dependencies, and environment file; there is no root npm workspace or root test/build command. From root, use `npm --prefix web ...` or `npm --prefix api ...` where appropriate.
- The browser calls the API over HTTP; these projects do not share an in-process service or source package. Read [README.md](README.md) for integration and startup links.
- For contract changes, inspect API DTO/controller metadata and generated `api/docs/openapi.json`, then update affected web adapters and validate both projects. Follow the API README for contract generation/checking.
- Keep shared terms in root `CONTEXT.md`, implementation guidance in project docs, and decisions in the owning project's `docs/adr/`. Validation and research notes are historical evidence, not current architecture or proof that today's checks pass.

## Issue workflow

Issues and specs live in GitHub Issues; use `gh` and [issue-tracker guidance](docs/agents/issue-tracker.md). When triaging, use [the repository's triage labels](docs/agents/triage-labels.md). Run `gh` against this repository; older project-local issue references may refer to pre-monorepo history, so verify their repository before acting.
