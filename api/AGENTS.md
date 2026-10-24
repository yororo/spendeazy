# API agent guidance

Supplements [root guidance](../AGENTS.md). Paths below are relative to `api/`. Start at the [task map](ARCHITECTURE.md#task-entry-points).

| Change | Read |
| --- | --- |
| Code creation, modification, or review | [Coding standards](docs/CODING_STANDARDS.md) |
| Module placement/dependencies | [Shape](ARCHITECTURE.md#shape), [feature modules](ARCHITECTURE.md#feature-modules), relevant [ADRs](docs/adr/) |
| Authentication, authorization, request-wide behavior | [Request lifecycle](ARCHITECTURE.md#request-lifecycle) |
| Persistence, atomic workflows, schema | [Persistence/transactions](ARCHITECTURE.md#persistence-and-transactions); for schema changes also [database design](docs/DATABASE_DESIGN.md) and `src/database/migrations/` |
| Errors or operational logging | [Errors/contracts](ARCHITECTURE.md#errors-and-contracts), [safe logging policy and implementation](docs/exception-logging.md) |
| HTTP contracts | [OpenAPI procedure](README.md#openapi-contract), the accepted [mobile contract](../docs/specifications/mobile-expense-domain-api.md), and affected mobile adapters when they exist |
| Setup/startup or real Clerk validation | [Setup](README.md#setup-and-run); for authenticated requests, [Clerk testing](docs/LOCAL_TESTING.md) |

## Validation

For code changes, run relevant unit and HTTP/PostgreSQL integration tests, `npm run build`, and lint. `npm run lint` applies fixes; use `npx eslint "{src,apps,libs,test}/**/*.ts"` for a read-only check.

During iteration, substitute the affected file in:

```bash
npm test -- --runInBand --runTestsByPath src/statement-imports/application/statement-imports.service.spec.ts
npm run test:e2e -- --runInBand --runTestsByPath test/statement-imports.e2e-spec.ts
```

Before completion, use `npm run test:postgres`, which requires all nine unique database URLs and rejects missing/shared targets. The root [isolated launcher](../docs/local-testing.md#run-the-required-isolated-apipostgresql-suite) supplies one disposable database per suite plus a separate historical-migration database. [Root guidance](../AGENTS.md) also owns independent mobile validation and delivery requirements.
