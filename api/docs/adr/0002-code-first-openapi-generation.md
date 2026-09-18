# ADR 0002: Generate the OpenAPI health tracer from Nest metadata

## Status

Accepted

## Context

The API needs a trustworthy OpenAPI contract, but the application currently has
a handwritten document that can drift from controllers, DTO validation, and
runtime response behavior. Generation must be usable in local development and
CI without PostgreSQL, Clerk credentials, or an HTTP listener.

The health endpoint is the first complete vertical slice because its response
has two observable status variants and its readiness dependency already has a
narrow application-owned port.

## Decision

Use the official Nest Swagger module as the code-first document generator and
enable its compile-time plugin with validation metadata reuse and comment
introspection. Keep the health response as a feature-owned response DTO and
declare metadata explicitly wherever reflection cannot prove the public
contract, including the two response statuses, JSON content, public security
override, and stable operation identifier convention.

Generate the tracer through a shared document factory. The factory creates a
documentation-only Nest composition containing the production health controller,
every production-capable feature controller through each feature module's
metadata-only registration, and an inert readiness provider, then closes the
application after Swagger metadata has been scanned. The metadata-only feature
registrations reuse the controller arrays used by production registration and
replace application services with inert tokens; they do not initialize
database, Clerk, or other infrastructure. This composition has no database,
Clerk, or listening-server dependencies. The same lower-level builder accepts
an existing Nest application so runtime documentation setup can use the same
contract configuration as the offline generator.

The document targets OpenAPI 3.0.3 and uses the explicit contract version
1.0.0. Operation IDs are derived from controller and method names with the
`Controller` suffix removed. The generation command validates JSON and YAML
output locally with Swagger Parser before it is emitted; runtime delivery uses
the same factory result.

## Consequences

- Controller and response DTO metadata become the source of truth for the
  migrated operations.
- The health tracer can be generated repeatedly and validated deterministically
  without external infrastructure.
- Explicit metadata remains necessary for behavior that TypeScript types and
  validation decorators cannot express, so annotation minimization is not a
  goal by itself.
- The generated document is now the sole API contract source: runtime Swagger
  UI, JSON, and YAML delivery and the committed JSON/YAML artifacts all use
  the shared factory after the feature migration slices reached parity.

## Rejected alternatives

- **Schema-first OpenAPI:** would create a second design surface that can drift
  from Nest controllers and runtime validation.
- **A custom TypeScript or Nest analyzer:** would duplicate framework metadata
  rules and increase maintenance without improving this first contract seam.
- **A single dual-purpose application composition:** would make generation
  depend on database and authentication infrastructure, reducing its
  reproducibility and making CI configuration-sensitive.
- **Keeping generated metadata as a second contract source beside the
  handwritten path table:** would preserve the drift the migration is intended
  to remove. The handwritten path table was retired when the generated feature
  slices reached parity.
