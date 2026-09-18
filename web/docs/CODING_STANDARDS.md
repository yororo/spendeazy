# Coding Standards

Apply these rules to every code change. Prefer the existing local pattern when it conflicts with a general preference.

## Design

- Make the smallest complete change. Keep code explicit, focused, and named for its intent.
- Introduce an abstraction only for proven reuse or a clearer boundary; otherwise keep code local.
- Keep each behavior in one authoritative place. Extract reusable UI into components and reusable behavior into hooks.
- Keep business logic separate from presentation when this makes either boundary clearer.
- Name non-obvious values; put configuration in configuration. Comments record rationale or constraints, not narration.
- Handle expected failures visibly. Remove obsolete, unused, and commented-out code.

## React

- Use functional components and hooks. Prefer composition to inheritance and broad configuration APIs.
- Keep state at its narrowest useful scope. Derive values instead of storing duplicates; add global state only when it is genuinely shared.
- Use `useEffect` only to synchronize with an external system, with complete dependencies.
- Use stable keys that identify the item; use an index only when identity and order cannot change.

## TypeScript and data

- Model the domain with strict, meaningful types. Make invalid states unrepresentable where practical.
- Use `unknown` for untrusted or genuinely unknown values; do not introduce `any`.
- Infer obvious implementation-local types. Explicitly type shared contracts and public APIs; minimize assertions.
- Keep server state separate from client/UI state. Centralize API access and common request/error handling.
- Validate all untrusted external data.

## UI, performance, and tests

- Implement loading, empty, error, and success states for data-dependent UI.
- Use semantic, accessible HTML with correct keyboard interaction and focus management.
- Measure or identify a concrete bottleneck before adding performance optimizations or memoization.
- Test observable behavior, critical flows, edge cases, and failure paths. Tests must be deterministic and independent.
