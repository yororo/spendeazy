# Spendeazy API

NestJS REST backend for the native Spendeazy client. Private routes use `/api/v1` and Clerk session tokens (`Authorization: Bearer <token>`); health and documentation routes are public. Saved spending uses the canonical Expense schema and authorized Space routes. The mobile project is not yet an authenticated API client, and the broader accepted mobile contract remains partially implemented. Commands and paths below are relative to `api/`.

## Setup and run

Requires Node.js, npm, and PostgreSQL.

To run the API and a fresh PostgreSQL database entirely in containers, use the
[disposable Bash launcher](../docs/local-testing.md#run-a-disposable-api-for-manual-testing).
It generates temporary keys, applies migrations and cleans up on Ctrl+C.

```bash
npm ci
cp .env.example .env
```

| Setting | Requirement / meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL database; required in production |
| `CLERK_JWT_KEY`, `CLERK_SECRET_KEY` | Clerk PEM public key for token verification and backend secret for authoritative profiles; required in production and ordinary authenticated development |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated HTTP(S) origins accepted in Clerk `azp` claims; required in production. Configure for the identity/token flow in use |
| `INVITATION_CODE_ENCRYPTION_KEY` | 32-byte hexadecimal key required whenever a database is configured; protects sender-only reversible Invite Code display alongside a separate HMAC lookup value |
| `GCASH_REFERENCE_HASH_KEY` | Separate stable 32-byte hexadecimal key required whenever a database is configured; HMAC-protects persisted GCash references, which are never returned. Retain across deployments for stable duplicate detection |

Generate each hexadecimal secret independently with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; keep secrets outside source control. `.env.example` lists settings; `src/config/app-config.ts` validates them. Shared Space archive notifications are in-app; no email provider setup is required.

Apply migrations, then start watch mode:

```bash
npm run migration:run
npm run start:dev
```

API: `http://localhost:3000/api/v1`; health: `http://localhost:3000/health`; documentation: `http://localhost:3000/docs`. For production, run `npm run build` then `npm run start:prod`.

### Development seed/reset

`npm run db:seed -- --disposable-database spendeazy_disposable_<suffix>` loads deterministic fictional data. To drop and recreate that database before loading it, run `npm run db:recreate-seed -- --disposable-database spendeazy_disposable_<suffix>`. Both commands require `NODE_ENV` other than production, a loopback PostgreSQL host, and an exact database-name match between `DATABASE_URL` and `--disposable-database`. Recreate is destructive by design; it cannot target a shared, production, or non-disposable database.

## Test

`npm test -- --runInBand` runs unit tests. `npm run test:postgres` runs all required HTTP/PostgreSQL integration suites and fails when any required `TEST_*_DATABASE_URL` is unset or two suites share a database. Use the root [isolated API/PostgreSQL launcher](../docs/local-testing.md#run-the-required-isolated-apipostgresql-suite) to provision one disposable database per suite. The historical ownership migration suite also receives its own empty pre-Space database. Automated suites use Clerk test doubles; [real Clerk testing](docs/LOCAL_TESTING.md) is separate.

The required integration database variables are:

| Suite | Database URL variable |
| --- | --- |
| Spaces | `TEST_SPACES_DATABASE_URL` |
| Category Rules | `TEST_CATEGORY_RULES_DATABASE_URL` |
| Category Colors | `TEST_CATEGORY_COLOR_DATABASE_URL` |
| Category HTTP concurrency | `TEST_SPACE_CATEGORIES_CONCURRENCY_DATABASE_URL` |
| Statement Import rollback/duplicates and GCash reference hashes | `TEST_STATEMENT_IMPORT_ROLLBACK_DATABASE_URL` |
| Statement Import Category concurrency | `TEST_STATEMENT_IMPORT_CATEGORY_CONCURRENCY_DATABASE_URL` |
| Imported Expense/Space provenance | `TEST_EXPENSE_STATEMENT_IMPORT_SPACE_DATABASE_URL` |
| Invitations | `TEST_INVITATIONS_DATABASE_URL` |
| Historical ownership migration | `TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL` — separate, empty disposable database starting from the pre-Space schema |

## OpenAPI contract

Nest controller/DTO metadata and the shared document factory generate the contract. `docs/openapi.yaml` is the canonical committed YAML specification; `docs/openapi.json` is generated from the same document for JSON tooling. Runtime `/docs`, `/docs-json`, and `/docs-yaml` use that document.

After changing a route, DTO, or contract annotation:

```bash
npm run openapi:generate
# Review the generated JSON/YAML diff, then check without rewriting:
npm run openapi:check
```

The check fails if either artifact is missing or differs from deterministic regeneration. Root CI also runs it. Inspect affected paths and referenced schemas together; update contract tests and coordinate any mobile adapter change. [Route compatibility](docs/route-compatibility.md) describes the current Space-only Expense route surface and removed legacy aliases.
