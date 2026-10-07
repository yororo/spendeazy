# Spendeazy

Private personal-finance software for tracking expenses, managing Budgets, and importing supported statements. Two npm projects share one [domain glossary](GLOSSARY.md).

| Project | Responsibility | Guides |
| --- | --- | --- |
| [web/](web/) | React/TypeScript browser application, built with Vite | [Setup](web/README.md), [architecture](web/docs/ARCHITECTURE.md) |
| [api/](api/) | NestJS REST API, TypeORM, PostgreSQL | [Setup](api/README.md), [architecture](api/ARCHITECTURE.md) |

## Integration boundary

The browser authenticates with Clerk session tokens. `/api/v1/users/me` provisions/resolves the User; financial workflows use `/api/v1/users/me/spaces/:spaceId/...` for the selected Space. The API enforces authenticated membership and write access. Personal compatibility aliases are described in the [route guide](api/docs/route-compatibility.md).

The web owns PDF extraction/reconciliation, temporary Upload/Categorize/Review state, and Category Rule matching. The API persists financial data and Rules, checks duplicates, and atomically saves Committed Statement Imports with reviewed Transactions. It receives JSON, not PDFs. Financial UI has no runtime mock-data fallback.

Financial data is Space-scoped. Invite Code acceptance creates a Shared Space; leaving preserves read-only history for both former members. [Domain decisions](docs/agents/domain.md) govern ownership and lifecycle. Account is derived from import provider/account type (Cash for manual Transactions), not a persisted Account entity; transport fields `bank` and `cardType` carry this metadata, including wallets.

Optional [Category Suggestions](docs/category-suggestions.md) send descriptions and scoped Category/history context through the API to TypeSafe. Manual selection remains available when the integration is disabled or unavailable.

API DTO/controller metadata defines the HTTP contract. Web services validate/adapt responses into feature-owned read models; contract changes can affect both projects. [API contract guidance](api/README.md#openapi-contract) owns generated artifacts and consistency checks.

## Local development

Follow each project's setup from its own directory and start the servers separately. Packages, lockfiles, dependencies, and environment files are project-local; there is no root package manager workspace.

Ordinary development uses web `http://localhost:5173` and API `http://localhost:3000`. Set `VITE_API_BASE_URL` to the API origin. Use the same Clerk instance and allow the actual web origin in API `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES`.

- **Credential-free browser/API/PostgreSQL:** [synthetic testing](docs/local-testing.md).
- **Real Clerk authenticated requests:** [API testing](api/docs/LOCAL_TESTING.md).

## Deployment

Root GitHub workflows validate PR/main revisions and gate web previews and production publication. API publication precedes web when both are selected. [Release guidance](docs/releases.md) owns selection, compatibility, migrations, locks, artifacts, manual runs, and verification.

## Documentation

Start at [AGENTS.md](AGENTS.md) for task routing and workflow; use [domain guidance](docs/agents/domain.md) for glossary/ADR placement.
