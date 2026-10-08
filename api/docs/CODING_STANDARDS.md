# Coding standards

Apply to API code changes and reviews. Follow established local conventions for general implementation choices.

## Implementation

- Give functions/classes/modules one responsibility and abstraction level; use intent-revealing names and guard clauses.
- Replace unexplained business literals with named constants; put environment settings in the existing configuration module. Add abstractions/dependencies to enforce a dependency boundary or test application rules independently; keep changes scoped.
- Inject dependencies explicitly; minimize shared mutable state.
- Expose only operations current callers need. Remove unused/commented-out code; comments explain rationale or constraints.

## HTTP and application boundaries

- Follow the [controller/application boundary](../ARCHITECTURE.md#shape); separate transport, application, and persistence models where responsibilities differ.
- Validate external input and enforce authenticated authorization/ownership on the server. [Architecture](../ARCHITECTURE.md#request-lifecycle) owns trusted identity and Space access.
- Use established status codes/error envelopes; responses exclude internal exceptions, stacks, database details, and secrets.
- Use async I/O and propagate cancellation where supported.

## Errors, logging, and tests

- Follow the [application-error contract](../ARCHITECTURE.md#errors-and-contracts) for expected failures.
- Catch only to handle, recover, enrich, or translate; otherwise propagate failures.
- Use the existing `ExceptionReporter`/logger and [logging allowlist](exception-logging.md) for operational failures. Keep sensitive data out of both responses and logs; preserve single-record reporting.
- Add/update tests when observable behavior changes.
