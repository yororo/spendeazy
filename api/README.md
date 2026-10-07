# Spendeazy API

NestJS REST backend for [Spendeazy Web](../web/README.md). Private routes use `/api/v1` and Clerk session tokens (`Authorization: Bearer <token>`); health/documentation are public. Commands and paths below are relative to `api/`.

## Setup and run

Requires Node.js, npm, and PostgreSQL. Install dependencies and create the local configuration:

```bash
npm install
cp .env.example .env
```

| Setting | Requirement / meaning |
| --- | --- |
| `DATABASE_URL` | Local PostgreSQL database; required in production |
| `CLERK_JWT_KEY`, `CLERK_SECRET_KEY` | Clerk PEM public key for token verification and backend secret for authoritative profiles; required in production and for ordinary authenticated development |
| `CLERK_AUTHORIZED_PARTIES`, `CORS_ORIGINS` | Explicit allowed frontend origins; required in production. Use the same Clerk instance as web |
| `INVITATION_CODE_ENCRYPTION_KEY` | 32-byte hexadecimal key required whenever a database is configured; protects sender-only reversible Invite Code display alongside a separate HMAC lookup value |
| `GCASH_REFERENCE_HASH_KEY` | Separate stable 32-byte hexadecimal key required whenever a database is configured; HMAC-protects persisted GCash references, which are never returned. Retain across deployments for stable duplicate detection |
| `TYPESAFE_API_KEY` | Optional Category Suggestions; [integration reference](../docs/category-suggestions.md) owns data sent, bounds, cache, and failure behavior |

Generate each hexadecimal secret independently with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; keep secrets outside source control. `.env.example` lists settings; `src/config/app-config.ts` validates them. Shared Space archive notifications are in-app; no email provider setup is required.

Apply migrations, then start watch mode:

```bash
npm run migration:run
npm run start:dev
```

API: `http://localhost:3000/api/v1`; health: `http://localhost:3000/health`; documentation: `http://localhost:3000/docs`. For production, run `npm run build` then `npm run start:prod`.

### Development seed/reset

`npm run db:seed` loads deterministic data. `npm run db:reset-seed` removes application data from the configured local database and reloads it. Both are restricted to non-production environments and local databases; choose reset only when removing that data is intended.

## Test

`npm test` runs unit tests; `npm run test:e2e` runs HTTP/PostgreSQL integration suites. Default suites use test doubles for Clerk; [real Clerk testing](docs/LOCAL_TESTING.md) is separate. [API guidance](AGENTS.md#validation) owns required checks and focused commands; additional scripts are in `package.json`.

PostgreSQL suites skip when their variable is unset. A skipped suite provides no coverage. Set the affected variables to disposable databases:

| Suite | Database URL variable |
| --- | --- |
| Spaces | `TEST_SPACES_DATABASE_URL` |
| Category Rules | `TEST_CATEGORY_RULES_DATABASE_URL` |
| Category Colors | `TEST_CATEGORY_COLOR_DATABASE_URL` |
| Category HTTP concurrency | `TEST_SPACE_CATEGORIES_CONCURRENCY_DATABASE_URL` |
| Statement Import rollback/duplicates and GCash reference hashes | `TEST_STATEMENT_IMPORT_ROLLBACK_DATABASE_URL` |
| Statement Import Category concurrency | `TEST_STATEMENT_IMPORT_CATEGORY_CONCURRENCY_DATABASE_URL` |
| Imported Transaction/Space provenance | `TEST_TRANSACTION_STATEMENT_IMPORT_SPACE_DATABASE_URL` |
| Category Suggestions | `TEST_STATEMENT_CATEGORY_SUGGESTIONS_DATABASE_URL` |
| Invitations | `TEST_INVITATIONS_DATABASE_URL` |
| Historical ownership migration | `TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL` — separate, empty disposable database; starts from the pre-Space schema |

The [synthetic launcher](../docs/local-testing.md#run-the-isolated-browser-suite) supplies a disposable rollback-suite database and runs real browser/API acceptance. It does not configure every PostgreSQL suite above.

## OpenAPI contract

Nest controller/DTO metadata and the shared document factory generate the contract. `docs/openapi.yaml` is the canonical committed YAML specification; keep it only in the API project. `docs/openapi.json` is generated from the same document for JSON tooling. Runtime `/docs`, `/docs-json`, and `/docs-yaml` use that document.

After changing a route, DTO, or contract annotation:

```bash
npm run openapi:generate
# Review the generated JSON/YAML diff, then check without rewriting:
npm run openapi:check
```

The check fails if either artifact is missing or differs from deterministic regeneration. Root CI also runs it. Inspect affected paths/referenced schemas and web adapters together; update contract tests and validate both projects. [Route compatibility](docs/route-compatibility.md) owns Personal aliases, explicit Space routes, and deprecation prerequisites.
