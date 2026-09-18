# API agent guidance

This file supplements [root AGENTS.md](../AGENTS.md) for `api/`. Read [README.md](README.md) for setup and [the shared glossary](../CONTEXT.md) for domain terms. Paths below are relative to `api/`.

- For code creation, modification, or review, read [coding standards](docs/CODING_STANDARDS.md).
- For module boundaries, dependencies, persistence, request-wide behavior, or cross-feature workflows, read [ARCHITECTURE.md](ARCHITECTURE.md) and relevant [ADRs](docs/adr/).
- For schema changes, read [database design](docs/DATABASE_DESIGN.md) and existing migrations under `src/database/migrations/`.
- For error handling or operational logging, read [exception logging](docs/exception-logging.md).
- For authenticated live testing, follow [local testing](docs/LOCAL_TESTING.md).
- For HTTP contract changes, follow the README's OpenAPI generation/check steps and inspect affected [web adapters](../web/docs/ARCHITECTURE.md).

Run relevant unit and end-to-end tests, `npm run build`, and lint from `api/`. The `npm run lint` script applies fixes; use `npx eslint "{src,apps,libs,test}/**/*.ts"` for a read-only lint check. See `package.json` for scripts and the README for contract checks.

Shared issue, triage, and domain-documentation guidance is linked from root `AGENTS.md`; keep repository policy there.
