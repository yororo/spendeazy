# Coding standards

Apply to API code changes and reviews. Follow established local conventions for general implementation choices.

## Implementation

- Give functions/classes/modules one responsibility and abstraction level; use intent-revealing names and guard clauses.
- Name business/configuration values. Introduce abstractions or dependencies for a concrete boundary or testability benefit; keep changes scoped.
- Use explicit injected dependencies; minimize shared mutable state and unintended side effects.
- Keep public interfaces small. Remove unused/commented-out code; comments explain rationale or constraints.

## HTTP and application boundaries

- Controllers map/validate input, call application logic, and return HTTP responses. Business logic belongs outside transport/persistence; separate models where responsibilities differ.
- Validate external input and enforce authenticated authorization/ownership on the server. [Architecture](../ARCHITECTURE.md#request-lifecycle) owns trusted identity and Space access.
- Use established status codes/error envelopes; responses exclude internal exceptions, stacks, database details, and secrets.
- Use async I/O and propagate cancellation where supported.

## Errors, logging, and tests

- Model expected failures with domain/application errors; central exception handling translates them to HTTP.
- Catch only to handle, recover, enrich, or translate; otherwise propagate failures.
- Use the existing `ExceptionReporter`/logger and [logging allowlist](exception-logging.md) for operational failures. Keep sensitive data out of both responses and logs; preserve single-record reporting.
- Add/update tests when observable behavior changes.
