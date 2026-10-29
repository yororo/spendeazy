# Spendeazy API

NestJS REST backend for the native Spendeazy client. Private routes use `/api/v1` and Clerk session tokens (`Authorization: Bearer <token>`); health and documentation routes are public. Saved spending uses the canonical Expense schema and authorized Space routes. The mobile project is an authenticated API client for Spaces, manual Expense creation, active/deleted browsing, revision-protected corrections, per-Expense Activity, Budget maintenance, and Monthly/Yearly Dashboard reporting; the broader accepted mobile contract remains partially implemented. Commands and paths below are relative to `api/`.

## Setup and run

Follow the shared [local runbook](../docs/local-testing.md) for first-time setup, daily PostgreSQL/API/mobile startup, device connectivity, shutdown and reset. Local development uses the root Compose database and host Nest watch mode. Configuration stays in ignored `api/.env`.

API settings:

| Setting | Requirement / meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL database; required in production |
| `CLERK_JWT_KEY`, `CLERK_SECRET_KEY` | Clerk PEM public key for token verification and backend secret for authoritative profiles; required in production and ordinary authenticated development |
| `INVITATION_CODE_ENCRYPTION_KEY` | 32-byte hexadecimal key required whenever a database is configured; protects sender-only reversible Invite Code display alongside a separate HMAC lookup value |
| `GCASH_REFERENCE_HASH_KEY` | Separate stable 32-byte hexadecimal key required whenever a database is configured; HMAC-protects persisted GCash references, which are never returned. Retain across deployments for stable duplicate detection |

Keep both encryption/hash keys stable for the database lifetime. `src/config/app-config.ts` validates configuration. For focused bearer-token checks use [Clerk testing](docs/LOCAL_TESTING.md).

Production uses `npm run build`, the compiled migration command and `npm run start:prod`; deployment details are in [releases](../docs/releases.md). The local runbook is for dedicated development data.

### Development seed/reset

`npm run db:seed -- --disposable-database spendeazy_disposable_<suffix>` loads deterministic fictional data. To drop and recreate that database before loading it, run `npm run db:recreate-seed -- --disposable-database spendeazy_disposable_<suffix>`. These synthetic fixtures do not populate the real Google identity's Personal Space. For an empty manual database use the runbook's [explicit reset](../docs/local-testing.md#shutdown-and-reset). Both commands require `NODE_ENV` other than production, a loopback PostgreSQL host, and an exact database-name match between `DATABASE_URL` and `--disposable-database`. Recreate is destructive by design; it cannot target a shared, production, or non-disposable database.

## Test

`npm test -- --runInBand` runs unit tests. `npm run test:postgres` runs all required HTTP/PostgreSQL integration suites and fails when any required `TEST_*_DATABASE_URL` is unset or two suites share a database. Use the root [isolated API/PostgreSQL launcher](../docs/local-checks.md#api-and-isolated-postgresql) to provision one disposable database per suite. The historical ownership migration suite also receives its own empty pre-Space database. Automated suites use Clerk test doubles; [real Clerk testing](docs/LOCAL_TESTING.md) is separate.

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
| Dashboard Reporting | `TEST_DASHBOARD_REPORTING_DATABASE_URL` |
| Historical ownership migration | `TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL` — separate, empty disposable database starting from the pre-Space schema |

The Dashboard Reporting suite exercises the authenticated `GET /api/v1/users/me/spaces/{spaceId}/reporting/dashboard` endpoint against PostgreSQL. It covers exact mixed-period planning, Manila period bounds, historical Expense inclusion/deletion exclusion, Budget checks, confirmation-time imports and chart-only Category filtering. Yearly cases additionally cover exact annual-to-Monthly planning and final half-up rounding, current configuration changes/removal/deactivation/reactivation against historical reports, the exact Manila New Year boundary, and Space/Category-filter independence. These HTTP/PostgreSQL fixtures establish server behavior; native Dashboard acceptance is recorded separately in the [IP-03 verification record](../docs/agents/implementation/IP-03-issue-150-verification.md).

## OpenAPI contract

Nest controller/DTO metadata and the shared document factory generate the contract. `docs/openapi.yaml` is the canonical committed YAML specification; `docs/openapi.json` is generated from the same document for JSON tooling. Runtime `/docs`, `/docs-json`, and `/docs-yaml` use that document.

After changing a route, DTO, or contract annotation:

```bash
npm run openapi:generate
# Review the generated JSON/YAML diff, then check without rewriting:
npm run openapi:check
```

The check fails if either artifact is missing or differs from deterministic regeneration. Root CI also runs it. Inspect affected paths and referenced schemas together; update contract tests and coordinate any mobile adapter change. [Route compatibility](docs/route-compatibility.md) describes the current Space-only Expense route surface and removed legacy aliases.
