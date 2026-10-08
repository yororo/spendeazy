# Web agent guidance

Supplements [root guidance](../AGENTS.md). Paths below are relative to `web/`. Start at the [task map](docs/ARCHITECTURE.md#task-entry-points).

| Change | Read |
| --- | --- |
| Code creation, modification, or review | [Coding standards](docs/CODING_STANDARDS.md) |
| Feature creation, structural refactors, cross-feature reuse | [Dependency direction](docs/ARCHITECTURE.md#dependency-direction), [placement](docs/ARCHITECTURE.md#placement), [feature contract](docs/ARCHITECTURE.md#feature-contract), relevant [ADRs](docs/adr/) |
| UI/UX | [Design system](DESIGN_SYSTEM.md) and its task-specific references; `design/ui-design.pen` is the visual reference |
| Endpoint contracts | [API guidance](../api/AGENTS.md), [OpenAPI procedure](../api/README.md#openapi-contract), affected specification paths/schemas |
| Category Suggestions, external data, caching, request limits | [Suggestion integration](../docs/category-suggestions.md) |
| Theme/Appearance or scroll restoration | [Composition/scroll mechanics](docs/ARCHITECTURE.md#composition-and-scroll-restoration), [visual behavior](docs/design-system/foundations.md#theme-and-appearance) |
| Setup/startup | [Web README](README.md) |

## Validation

For code changes, run `npm run lint`, `npm run build`, and `npm test`. For authenticated financial workflows, validate the affected browser/API flow and report any live validation that could not run.

During iteration, run `npm test -- src/features/statement-import/statement-import-workflow.test.ts`, substituting the affected colocated Vitest file. Browser acceptance lives in `e2e/`; [synthetic testing](../docs/local-testing.md#focused-browser-diagnostics) owns focused invocation and environment setup. `npm run typecheck:e2e` checks browser-test/configuration types without services.

Project checks and the root-required unfiltered isolated suite remain completion gates.
