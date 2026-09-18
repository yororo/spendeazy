# Spendeazy

Spendeazy is a private personal-finance application for tracking expenses, managing Budgets, and importing supported account statements. The monorepo contains two projects sharing one [domain glossary](CONTEXT.md).

| Project | Responsibility | Development guide |
| --- | --- | --- |
| [web/](web/) | React/TypeScript browser application built with Vite | [Web README](web/README.md), [architecture](web/docs/ARCHITECTURE.md) |
| [api/](api/) | NestJS REST backend with TypeORM and PostgreSQL | [API README](api/README.md), [architecture](api/ARCHITECTURE.md) |

## Integration boundary

The browser calls self-scoped `/api/v1/users/me` endpoints with the current Clerk session token. The API resolves the local User and enforces ownership. Persisted financial data comes from the API; there is no runtime mock-data fallback.

The web owns PDF extraction, provider reconciliation, temporary Upload/Categorize/Review state, and Category Rule evaluation. The API stores Category Rules, checks duplicates, and atomically saves a Committed Statement Import with its reviewed Transactions. It receives reviewed JSON, not the PDF. Account is a presentation of the import's provider/account type (or Cash for manual Transactions), not a separate persisted financial-account entity. Existing transport fields `bank` and `cardType` carry that provider/account-type metadata, including wallet statements.

API DTO/controller metadata defines the HTTP contract; committed OpenAPI artifacts in `api/docs/` are generated from it. Web feature services validate and adapt responses into their own read models. A contract change may require work in both projects. `web/docs/SPENDEAZY_API_SPEC.yml` is a separate contract copy; consult the generated artifacts in `api/docs/` for the current contract rather than maintaining that copy as another authority.

## Local development

Follow the [API setup](api/README.md) and [web setup](web/README.md), each from its own directory, and run the two servers in separate terminals. Dependencies and environment files are project-local. There is no root package manager workspace.

The web normally runs on `http://localhost:5173` and the API on `http://localhost:3000`. Set the web's `VITE_API_BASE_URL` to the API origin. Use the same Clerk instance for both projects and configure the API's `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` for the actual web origin. See [local API testing](api/docs/LOCAL_TESTING.md) for authenticated validation.

## Documentation

Start with [AGENTS.md](AGENTS.md) for task routing. [Domain documentation guidance](docs/agents/domain.md) describes glossary and ADR ownership. Project READMEs own setup, architecture documents own code placement, and project coding standards own implementation conventions.
