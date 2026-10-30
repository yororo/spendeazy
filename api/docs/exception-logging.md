# Exception logging

[Reporter, framework logger, and request correlation](../src/logging/exception-logger.ts).

The running API writes one JSON object per line to stderr for unexpected HTTP
5xx failures, recovered default-category and database-readiness failures,
framework errors, startup failures and fatal process exceptions. Routine 4xx
responses, successful requests and framework lifecycle messages are silent.
Repeated handling of the same Error object emits only one record.

Account-deletion polling failures use the same safe reporter. Retryable stage
failures emit only `account_deletion_stage_failed`, a fixed `personal`/`provider`
stage and the persisted failure-code allowlist. They exclude operation identity,
provider IDs, claim tokens and provider payloads. Restricted database inspection
provides per-operation progress.

Records contain a UTC timestamp, error level, a fixed event category, and safe
stack locations when available. Request-scoped records also include a generated
request ID, HTTP method and matched route template; HTTP failures include status.
The API returns the generated ID in `X-Request-ID`. Incoming request IDs are
ignored. Middleware runs before body parsing so parser failures also receive an
ID. Unmatched routes have no route field.

Raw messages, exception names, causes, object properties, SQL, parameters,
headers, bodies, query strings, actual URLs, user identifiers and financial data
are excluded. Stack output retains only file/line/column locations for existing
files under the deployed `src`, `dist` or `node_modules` directories; absolute
paths and function names are omitted. Framework text-only failures have no stack.
This deliberate loss of diagnostic detail avoids relying on incomplete masking
patterns. TypeORM query logging is explicitly disabled.

In Azure Container Apps, inspect the container's console logs and filter by
`event`, `status` or `requestId`. Fatal process failures exit with status 1 after
synchronously writing their safe record. Configure Azure retention, alerts, and monitoring separately. Development seed and OpenAPI CLI
output are outside the running API's logging policy.
