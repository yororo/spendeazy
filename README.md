# Spendeazy

Spendeazy is a private personal-finance application for tracking expenses, managing Budgets, and importing supported account statements. The monorepo contains two projects sharing one [domain glossary](CONTEXT.md).

## Sharing release gate

Financial persistence and authorization are Space-scoped, including migrated Personal history and actor attribution. Shared Space support remains disabled for production Users until the invitation, membership management, Space switching, and complete browser sharing workflows are implemented and validated.

| Project | Responsibility | Development guide |
| --- | --- | --- |
| [web/](web/) | React/TypeScript browser application built with Vite | [Web README](web/README.md), [architecture](web/docs/ARCHITECTURE.md) |
| [api/](api/) | NestJS REST backend with TypeORM and PostgreSQL | [API README](api/README.md), [architecture](api/ARCHITECTURE.md) |

## Integration boundary

The browser calls self-scoped `/api/v1/users/me` endpoints with the current Clerk session token. The API resolves the local User and enforces ownership. Persisted financial data comes from the API; there is no runtime mock-data fallback.

The web owns PDF extraction, provider reconciliation, temporary Upload/Categorize/Review state, and Category Rule evaluation. The API stores Category Rules, checks duplicates, and atomically saves a Committed Statement Import with its reviewed Transactions. It receives reviewed JSON, not the PDF. Account is a presentation of the import's provider/account type (or Cash for manual Transactions), not a separate persisted financial-account entity. Existing transport fields `bank` and `cardType` carry that provider/account-type metadata, including wallet statements.

API DTO/controller metadata defines the HTTP contract, and the canonical committed YAML specification is generated at `api/docs/openapi.yaml`. This is the repository's single OpenAPI YAML source of truth; do not maintain a copy under `web/`. The generated `api/docs/openapi.json` sibling represents the same document for JSON tooling. Web feature services validate and adapt responses into their own read models, so a contract change may require work in both projects.

## Local development

Follow the [API setup](api/README.md) and [web setup](web/README.md), each from its own directory, and run the two servers in separate terminals. Dependencies and environment files are project-local. There is no root package manager workspace.

The web normally runs on `http://localhost:5173` and the API on `http://localhost:3000`. Set the web's `VITE_API_BASE_URL` to the API origin. Use the same Clerk instance for both projects and configure the API's `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` for the actual web origin. See [local API testing](api/docs/LOCAL_TESTING.md) for authenticated validation.

For a credential-free browser/API/PostgreSQL environment, see [local synthetic testing](docs/local-testing.md). It provides the dedicated loopback-only launcher and Playwright smoke command.

## Deployment

[The root deployment workflow](.github/workflows/deploy.yml) detects changes for each project. Pushes to `main` deploy web for changes under `web/` and API for changes under `api/`; changes to the workflow itself deploy both. Other root-only changes skip both deployment jobs.

Pull requests targeting `main` build web previews when web or workflow files change. Closing a pull request attempts preview cleanup even if its web changes were later reverted. API deployments only run on pushes to `main` or manual runs. Use **Run workflow** in GitHub Actions to deploy `web`, `api`, or `all` manually.

The workflow uses the existing Azure and registry secrets and web build variables. Web builds from `web/`; the API container builds from `api/Dockerfile` with `api/` as its build context.

## Documentation

Start with [AGENTS.md](AGENTS.md) for task routing. [Domain documentation guidance](docs/agents/domain.md) describes glossary and ADR ownership. Project READMEs own setup, architecture documents own code placement, and project coding standards own implementation conventions.
