# Exception logging

[Reporter, framework logger, and request correlation](../src/logging/exception-logger.ts).

## Events

The running API writes one JSON object per line to stderr for unexpected HTTP 5xx failures, recovered default-category and database-readiness failures, framework errors, startup failures and fatal process exceptions. Routine 4xx responses, successful requests and framework lifecycle messages are silent. The same Error object is written once.

Account-deletion polling failures use the same reporter. Retryable stage failures emit only `account_deletion_stage_failed`, stage `personal` or `provider`, and the persisted failure-code allowlist. Restricted database inspection provides per-operation progress.

## Records

Records contain a UTC timestamp, error level, event and stack. Request-scoped records also include a generated request ID, HTTP method and matched route template; HTTP failures include status. The API returns that ID in `X-Request-ID`. Incoming request IDs are ignored. Middleware runs before body parsing, so parser failures also receive an ID. Unmatched routes have no route field.

Raw messages, exception names, causes, object properties, SQL, parameters, headers, bodies, query strings, actual URLs, user identifiers and financial data are excluded. Stack output is relative file:line:column for existing files under the deployed `src`, `dist` or `node_modules` directories. Framework text-only failures have no stack. Do not mask excluded fields. TypeORM query
logging is disabled.

## Runtime

Fatal process exceptions exit with status 1 after synchronously writing their record. In Azure Container Apps, filter the container console by `event`, `status` or `requestId`. Configure Azure retention, alerts and monitoring separately. Development seed and OpenAPI CLI output are outside this policy.
