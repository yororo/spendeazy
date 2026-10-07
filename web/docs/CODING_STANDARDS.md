# Coding standards

Apply to web code changes and reviews. Existing local patterns govern general preferences; [architecture](ARCHITECTURE.md) and [design guidance](../DESIGN_SYSTEM.md) own boundaries and UI conventions.

## Design

- Make the smallest complete change; keep names/behavior explicit and focused.
- Introduce abstractions for proven reuse or a clearer boundary; otherwise keep code local. Give each behavior one authority, reusable UI a component, and reusable behavior a hook.
- Separate business logic/presentation when it clarifies either boundary. Name non-obvious values and keep configuration in configuration.
- Comments explain rationale/constraints. Remove obsolete, unused, and commented-out code; expose expected failures visibly.

## React

- Use functional components/hooks and composition; keep configuration APIs narrow.
- Keep state at its narrowest useful scope. Derive values instead of duplicating state; global state requires actual sharing.
- Effects synchronize external systems with complete dependencies.
- Keys identify items; index keys require stable identity/order.

## TypeScript and data

- Use strict domain types; make invalid states unrepresentable where practical. Use `unknown` rather than `any` for untrusted/unknown data and validate it.
- Infer obvious local types; explicitly type public/shared contracts and minimize assertions.
- Separate server state from UI state; use centralized API transport/error handling with feature-owned endpoint adapters.

## UI, performance, and tests

- Data-dependent UI includes loading, empty, error, and success states.
- Use semantic HTML, keyboard interaction, and focus management.
- Identify/measure a bottleneck before optimizing or memoizing.
- Test observable behavior, critical flows, edge cases, and failure paths with deterministic, independent tests.
