# Spendeazy API

Spendeazy is a NestJS REST API for personal expense tracking. It manages users, categories, budgets, transactions, category rules, and reviewed credit-card statement imports. Versioned API routes are served under `/api/v1` and require Clerk session tokens in an `Authorization: Bearer <token>` header. Health and documentation endpoints are public.

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

## OpenAPI contract

The OpenAPI contract is generated from the Nest controllers and DTO metadata
through the shared document factory. The generated artifacts are committed at
`docs/openapi.json` and `docs/openapi.yaml` so they can be inspected or used by
external tooling. Runtime documentation uses the same generated document at
`/docs`, `/docs-json`, and `/docs-yaml`.

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

The same check runs in GitHub Actions and fails when either artifact is missing
or out of date.

To reset the local database and reload development data, run `npm run db:reset-seed`. This is destructive and removes application data from the configured local database.
