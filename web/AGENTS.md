# Web agent guidance

This file supplements [root AGENTS.md](../AGENTS.md) for `web/`. Read [README.md](README.md) for setup and [the shared glossary](../CONTEXT.md) for domain terms. Paths below are relative to `web/`.

- For code creation, modification, or review, read [coding standards](docs/CODING_STANDARDS.md).
- For feature creation, structural refactors, or cross-feature reuse, read [architecture](docs/ARCHITECTURE.md) and relevant [ADRs](docs/adr/).
- For UI/UX changes, read [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). It owns visual tokens, interaction and accessibility rules; architecture owns code placement. `design/ui-design.pen` is the visual reference.
- For endpoint changes, also inspect the [API guidance](../api/AGENTS.md) and generated contract in `../api/docs/openapi.json`. The separate `docs/SPENDEAZY_API_SPEC.yml` copy is not the contract authority.

Run `npm run lint`, `npm run build`, and `npm test` from `web/` for code changes. For authenticated financial workflows, validate the affected browser/API flow and report any live validation that could not run. See `package.json` for available scripts.

Shared issue, triage, and domain-documentation guidance is linked from root `AGENTS.md`; keep repository policy there.
