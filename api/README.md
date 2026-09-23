# Spendeazy API

The backend for the sibling [web project](../web/README.md) is a NestJS REST API. It manages Users, Categories, Budgets, Transactions, Category Rules, and Committed Statement Imports from supported account statements, using the [shared domain vocabulary](../CONTEXT.md). Versioned API routes are served under `/api/v1` and require Clerk session tokens in an `Authorization: Bearer <token>` header. Health and documentation endpoints are public.

See [architecture](ARCHITECTURE.md) for code placement and [local testing](docs/LOCAL_TESTING.md) for authenticated requests. All commands and paths below are relative to `api/`; change into that directory from the repository root first.

## Prerequisites

- Node.js and npm
- PostgreSQL

## Setup and run

```bash
npm install
cp .env.example .env
```

Set `DATABASE_URL` in `.env` to a local PostgreSQL database, then apply the schema:

```bash
npm run migration:run
```

Set `CLERK_JWT_KEY` to the PEM public key from Clerk, `CLERK_SECRET_KEY` to the Clerk backend secret, and `CLERK_AUTHORIZED_PARTIES` to the comma-separated frontend origins that may issue session tokens. Production startup also requires `CORS_ORIGINS` and the Clerk settings.

Set `INVITATION_CODE_ENCRYPTION_KEY` to a 32-byte hexadecimal secret in every production API environment. It protects the reversible sender-only Invite Code display value while the database stores a separate HMAC lookup value. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and keep it outside source control.

Shared Space archive notifications use a separate email boundary. Set `SPACE_NOTIFICATION_DELIVERY_URL` (and, when required, `SPACE_NOTIFICATION_DELIVERY_API_KEY`) to connect its provider. If it is unset or unavailable, the in-app notification remains stored with a retryable failed email status.

Optionally load deterministic development data with `npm run db:seed`. The seed commands are restricted to non-production environments and local databases.

Start the API in watch mode:

```bash
npm run start:dev
```

The API is available at `http://localhost:3000/api/v1`. Open `http://localhost:3000/docs` for the API documentation and `http://localhost:3000/health` for the health check.

For a production run:

```bash
npm run build
npm run start:prod
```

## Test

```bash
npm run test       # Unit tests
npm run test:e2e   # End-to-end tests
npm run test:cov   # Unit tests with coverage
npm run lint       # Lint the project
```

PostgreSQL end-to-end suites use `TEST_SPACES_DATABASE_URL`, `TEST_CATEGORY_RULES_DATABASE_URL`, `TEST_CATEGORY_COLOR_DATABASE_URL`, `TEST_STATEMENT_IMPORT_ROLLBACK_DATABASE_URL`, `TEST_STATEMENT_IMPORT_CATEGORY_CONCURRENCY_DATABASE_URL`, `TEST_TRANSACTION_STATEMENT_IMPORT_SPACE_DATABASE_URL`, and `TEST_INVITATIONS_DATABASE_URL`. Point these at a disposable test database. The historical ownership migration suite uses `TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL` and requires a separate, empty disposable database because it starts from the pre-Space schema. The suites skip when their URL is unset.

## OpenAPI contract

The OpenAPI contract is generated from the Nest controllers and DTO metadata
through the shared document factory. The canonical committed YAML specification
is `docs/openapi.yaml`; it is the repository's single OpenAPI YAML source of
truth, and no copy is maintained in the web project. The committed
`docs/openapi.json` sibling is generated from the same document for JSON tooling.
Runtime documentation also uses that generated document at `/docs`, `/docs-json`,
and `/docs-yaml`.

After changing an API route, DTO, or contract annotation, regenerate the
artifacts:

```bash
npm run openapi:generate
```

Review the JSON or YAML diff, then verify that both committed artifacts exactly
match deterministic regeneration without changing files:

```bash
npm run openapi:check
```

The check fails when either artifact is missing or out of date. Run it locally; workflow files currently live under project-local `.github/workflows/` directories rather than the monorepo root.

To reset the local database and reload development data, run `npm run db:reset-seed`. This is destructive and removes application data from the configured local database.
