# Spendeazy

Spendeazy is a private personal-finance application for tracking expenses, managing Budgets, and importing supported account statements. The monorepo contains two projects sharing one [domain glossary](GLOSSARY.md).

## Financial Spaces

Financial persistence and authorization are Space-scoped, including migrated Personal history and actor attribution. Sharing uses Invite Codes: eligible Users save an invitation and explicitly accept it to create a Shared Space. Leaving archives the Space as read-only history for both former members. See the [Space and invitation decisions](docs/agents/domain.md) for ownership and lifecycle rules.

| Project | Responsibility | Development guide |
| --- | --- | --- |
| [web/](web/) | React/TypeScript browser application built with Vite | [Web README](web/README.md), [architecture](web/docs/ARCHITECTURE.md) |
| [api/](api/) | NestJS REST backend with TypeORM and PostgreSQL | [API README](api/README.md), [architecture](api/ARCHITECTURE.md) |

## Integration boundary

The browser authenticates with the current Clerk session token. User provisioning and identity use `/api/v1/users/me`; financial workflows use `/api/v1/users/me/spaces/:spaceId/...` for the selected Space. Legacy financial `/users/me/...` routes resolve the User's Personal Space. The API resolves the local User and enforces Space membership and write access. Persisted financial data comes from the API; there is no runtime mock-data fallback.

The web owns PDF extraction, provider reconciliation, temporary Upload/Categorize/Review state, and Category Rule evaluation. The API stores Category Rules, checks duplicates, and atomically saves a Committed Statement Import with its reviewed Transactions. It receives reviewed JSON, not the PDF. Account is a presentation of the import's provider/account type (or Cash for manual Transactions), not a separate persisted financial-account entity. Existing transport fields `bank` and `cardType` carry that provider/account-type metadata, including wallet statements.

Category Suggestions add an optional external processor to this boundary. During Categorize, the browser asks the API for suggestions for included Unmapped Transactions, deduplicating descriptions after trimming, collapsing whitespace, and ignoring letter case within the current Space and Category catalog. With the API's optional **TYPESAFE_API_KEY**, the API calls TypeSafe using active Categories and selected categorized-history examples from the authorized destination Space. The request can include Transaction descriptions, Category IDs, Category names and descriptions, and selected historical descriptions with Category IDs; these texts can identify financial activity. The TypeSafe request omits PDFs, amounts, dates, and explicit User and Space IDs. If the key is absent or TypeSafe is unavailable, the UI keeps manual Category selection available. The [API architecture](api/ARCHITECTURE.md#optional-typesafe-category-suggestions) documents request bounds, cache lifetime, timeouts, and defensive controls.

API DTO/controller metadata defines the HTTP contract, and the canonical committed YAML specification is generated at `api/docs/openapi.yaml`. This is the repository's single OpenAPI YAML source of truth; do not maintain a copy under `web/`. The generated `api/docs/openapi.json` sibling represents the same document for JSON tooling. Web feature services validate and adapt responses into their own read models, so a contract change may require work in both projects.

## Local development

Follow the [API setup](api/README.md) and [web setup](web/README.md), each from its own directory, and run the two servers in separate terminals. Dependencies and environment files are project-local. There is no root package manager workspace.

The web normally runs on `http://localhost:5173` and the API on `http://localhost:3000`. Set the web's `VITE_API_BASE_URL` to the API origin. Use the same Clerk instance for both projects and configure the API's `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` for the actual web origin. See [local API testing](api/docs/LOCAL_TESTING.md) for authenticated validation.

For a credential-free browser/API/PostgreSQL environment, see [local synthetic testing](docs/local-testing.md). It provides the dedicated loopback-only launcher and Playwright smoke command.

## Deployment

[The root deployment workflow](.github/workflows/deploy.yml) validates the exact checkout through the reusable [CI workflow](.github/workflows/ci.yml) before publication. Pushes to `main` deploy each project when its paths changed since its last successful upload; changes to either workflow or the release scripts deploy both. Other root-only changes skip both deployment jobs when no unpublished project changes remain.

Pull requests targeting `main` build web previews when web or workflow files change. Closing a pull request attempts preview cleanup even if its web changes were later reverted. API deployments only run on pushes to `main` or manual runs. Use **Run workflow** in GitHub Actions to deploy `web`, `api`, or `all` manually.

The workflow uses the existing Azure and registry secrets and web build variables. Web builds from `web/`; the API container builds from `api/Dockerfile` with `api/` as its build context.

When both projects are selected, API publication must succeed before web publication. A shared production concurrency lock prevents releases overlapping; active publication is never canceled by a newer push. Production runs must target the current `main` revision. Manual `web` and `api` selections still validate both projects. See [release guidance](docs/releases.md) for compatibility, enforcement, and safe gate verification.

## Documentation

Start with [AGENTS.md](AGENTS.md) for task routing. [Domain documentation guidance](docs/agents/domain.md) describes glossary and ADR ownership. Project READMEs own setup, architecture documents own code placement, and project coding standards own implementation conventions.
