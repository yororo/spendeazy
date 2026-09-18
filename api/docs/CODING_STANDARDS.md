# Coding Standards

Write code that is clear, safe, testable, and easy to change. Follow established project conventions unless a change has a concrete benefit.

## General

- Prefer simple, explicit code; use intention-revealing names.
- Give each function, class, and module one clear responsibility and one abstraction level. Use guard clauses to keep control flow shallow.
- Represent business and configuration values with named constants, enums, or configuration.
- Add abstractions or dependencies only for a clear architectural or testability benefit. Keep changes scoped; avoid unrelated refactors.
- Prefer explicit dependencies and dependency injection. Minimize shared mutable state and unintended side effects.

## REST API

- Keep endpoints thin: map and validate input → call application logic → return an HTTP response.
- Keep business logic out of transport and persistence layers. Separate API, domain, and persistence models where their responsibilities differ.
- Validate external input and enforce authorization and ownership on the server.
- Use appropriate status codes and the established error format. Keep exceptions, stack traces, database details, secrets, and other sensitive data out of responses.
- Centralize error handling. Use async I/O and propagate cancellation where supported.

## Errors & Logging

- Model expected failures with domain or application errors.
- Catch exceptions only to handle, recover, enrich, or translate them; otherwise let them propagate. Never swallow errors.
- Log actionable operational context once, without sensitive data.

## Maintainability

- Keep public interfaces small and explicit.
- Delete unused code instead of commenting it out.
- Comment on why, constraints, or non-obvious decisions—not self-evident code.
- Add or update tests when observable behavior changes.
