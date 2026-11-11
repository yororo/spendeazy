# API agent guidance

Supplements [root guidance](../AGENTS.md). Paths below are relative to `api/`.

| Change | Read |
| --- | --- |
| Code creation, modification, or review | [Coding standards](docs/CODING_STANDARDS.md) |
| Module placement/dependencies | [Shape](ARCHITECTURE.md#shape), [feature modules](ARCHITECTURE.md#feature-modules), relevant [ADRs](docs/adr/) |
| Authentication, authorization, request-wide behavior | [Request lifecycle](ARCHITECTURE.md#request-lifecycle) |
| Persistence, atomic workflows, schema | [Persistence/transactions](ARCHITECTURE.md#persistence-and-transactions); for schema changes also [database design](docs/DATABASE_DESIGN.md) and `src/database/migrations/` |
| Errors or operational logging | [Errors/contracts](ARCHITECTURE.md#errors-and-contracts), [safe logging policy and implementation](docs/exception-logging.md) |
| HTTP contracts | [OpenAPI procedure](README.md#openapi-contract), the accepted [mobile contract](../docs/specifications/mobile-expense-domain-api.md), and affected mobile adapters when they exist |
| Local setup/startup or manual device testing | [Local runbook](../docs/testing/local-testing.md); focused API authentication checks — [Clerk testing](docs/LOCAL_TESTING.md) |

## Validation

For code changes, run relevant unit and HTTP/PostgreSQL integration tests, `npm run build`, and lint. `npm run lint` applies fixes; use `npx eslint "{src,apps,libs,test}/**/*.ts"` for a read-only check.

During iteration, substitute the affected file in:

```bash
npm test -- --runInBand --runTestsByPath src/statement-imports/application/statement-imports.service.spec.ts
npm run test:e2e -- --runInBand --runTestsByPath test/statement-imports.e2e-spec.ts
```

Before completion, use `npm run test:postgres`, which requires all ten unique database URLs and rejects missing/shared targets.

## OpenAPI contract

Nest controller/DTO metadata and the shared document factory generate the contract. `docs/openapi.yaml` is the canonical committed YAML specification; `docs/openapi.json` is generated from the same document for JSON tooling. Runtime `/docs`, `/docs-json`, and `/docs-yaml` use that document.

After changing a route, DTO, or contract annotation:

```bash
npm run openapi:generate
# Review the generated JSON/YAML diff, then check without rewriting:
npm run openapi:check
```

The check fails if either artifact is missing or differs from deterministic regeneration. Root CI also runs it. Inspect affected paths and referenced schemas together; update contract tests and coordinate any mobile adapter change. Route compatibility describes the current Space-only Expense route surface and removed legacy aliases.
