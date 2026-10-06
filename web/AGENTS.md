# Web agent guidance

This file supplements [root AGENTS.md](../AGENTS.md) for `web/`. Read [README.md](README.md) for setup and [the shared glossary](../GLOSSARY.md) for domain terms. Paths below are relative to `web/`.

- For code creation, modification, or review, read [coding standards](docs/CODING_STANDARDS.md).
- For feature creation, structural refactors, or cross-feature reuse, read [architecture](docs/ARCHITECTURE.md) and relevant [ADRs](docs/adr/).
- For UI/UX changes, read [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), then its task-specific references. It routes to visual tokens, interaction and accessibility rules; architecture owns code placement. `design/ui-design.pen` is the visual reference.
- For endpoint changes, also inspect the [API guidance](../api/AGENTS.md) and canonical generated YAML specification at `../api/docs/openapi.yaml`. It is the repository's single OpenAPI YAML source of truth; do not maintain an OpenAPI copy under `web/`. The sibling `../api/docs/openapi.json` is generated from the same API document for JSON tooling.

Run `npm run lint`, `npm run build`, and `npm test` from `web/` for code changes. For authenticated financial workflows, validate the affected browser/API flow and report any live validation that could not run. See `package.json` for available scripts.

## Focused validation

From `web/`, run `npm test -- src/features/statement-import/statement-import-workflow.test.ts` for one colocated Vitest file; substitute the affected file. Browser acceptance lives in `e2e/` and uses the real services. Its environment and invocation are owned by [local synthetic testing](../docs/local-testing.md#run-the-isolated-browser-suite).

Use focused tests during implementation; the project checks above and the root-required isolated suite remain completion checks for code changes.

Shared issue, triage, and domain-documentation guidance is linked from root `AGENTS.md`; keep repository policy there.
