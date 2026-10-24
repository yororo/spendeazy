# Current API route compatibility

This guide inventories the current API surface. Personal compatibility aliases remain active in API v1 and are not marked as deprecated in OpenAPI. No active first-party browser client consumes these routes, and issue #100 did not remove or change them. They remain part of the current API until the breaking target contract is implemented.

**Replacement boundary:** the accepted [mobile Expense target decision](../../docs/adr/0004-mobile-expense-domain-and-contract.md) removes Personal financial aliases and old Transaction names without a compatibility window in the planned development replacement. That implementation has not shipped. This guide records current API behavior; it does not require preserving aliases in the target.

The accepted [mobile Expense contract](../../docs/specifications/mobile-expense-domain-api.md), recorded in [ADR 0004](../../docs/adr/0004-mobile-expense-domain-and-contract.md), intentionally replaces Transaction-oriented routes and Personal financial aliases with the new contract. It does not require a deprecation period or old-client coexistence. This ticket retires the web client and its delivery gates; separate work implements that target contract.

## Current route behavior

Current financial routes are authenticated under `/api/v1/users/me`. A Personal alias resolves the authenticated User's Personal Space and delegates to the same feature service as the corresponding explicit Space route. An explicit Space route treats `spaceId` as a lookup key and authorizes the User's membership through `SpaceAccessService`. A Personal alias never selects a Shared Space. These are facts about the current API runtime, not proposed target routes.

| Financial family | Current Personal alias | Current explicit Space route |
| --- | --- | --- |
| Categories | `GET/POST /api/v1/users/me/categories`; `GET/PATCH /api/v1/users/me/categories/{categoryId}` | `GET/POST /api/v1/users/me/spaces/{spaceId}/categories`; `GET/PATCH /api/v1/users/me/spaces/{spaceId}/categories/{categoryId}` |
| Budgets | `GET/PUT/DELETE /api/v1/users/me/categories/{categoryId}/budget` | `GET/PUT/DELETE /api/v1/users/me/spaces/{spaceId}/categories/{categoryId}/budget` |
| Category Rules | `GET/POST /api/v1/users/me/category-rules`; `GET/PATCH/DELETE /api/v1/users/me/category-rules/{ruleId}`; `PUT /api/v1/users/me/categories/{categoryId}/rules` | `GET/POST /api/v1/users/me/spaces/{spaceId}/category-rules`; `GET/PATCH/DELETE /api/v1/users/me/spaces/{spaceId}/category-rules/{ruleId}`; `PUT /api/v1/users/me/spaces/{spaceId}/categories/{categoryId}/rules` |
| Transactions | `GET/POST /api/v1/users/me/transactions`; `GET /api/v1/users/me/transactions/history`; `GET/PATCH/DELETE /api/v1/users/me/transactions/{transactionId}`; `GET /api/v1/users/me/transactions/{transactionId}/activity` | `GET/POST /api/v1/users/me/spaces/{spaceId}/transactions`; `GET /api/v1/users/me/spaces/{spaceId}/transactions/history`; `GET/PATCH/DELETE /api/v1/users/me/spaces/{spaceId}/transactions/{transactionId}`; `GET /api/v1/users/me/spaces/{spaceId}/transactions/{transactionId}/activity` |
| Statement Imports | `GET/POST /api/v1/users/me/statement-imports`; `GET /api/v1/users/me/statement-imports/{statementImportId}` | `GET/POST /api/v1/users/me/spaces/{spaceId}/statement-imports`; `GET /api/v1/users/me/spaces/{spaceId}/statement-imports/{statementImportId}` |
| Category summaries | `GET /api/v1/users/me/category-summaries` | `GET /api/v1/users/me/spaces/{spaceId}/category-summaries` |

The current [OpenAPI YAML](openapi.yaml) lists the routes generated from API controller and DTO metadata. The target contract is maintained separately until API implementation begins.

## Capabilities without a Personal alias

- Space catalog and lifecycle operations such as `GET /api/v1/users/me/spaces`, `GET /api/v1/users/me/spaces/{spaceId}`, and `POST /api/v1/users/me/spaces/{spaceId}/leave`.
- Category Suggestions at `POST /api/v1/users/me/spaces/{spaceId}/statement-imports/category-suggestions`.
- Invite Code and notification routes, which are User-scoped capabilities rather than paired financial-resource routes.

## Compatibility policy

The historical deprecation lifecycle described in [ADR 0002](../../docs/adr/0002-personal-and-shared-spaces.md) is superseded by the accepted target contract. Do not add compatibility shims for the retired browser client or treat this route inventory as a reason to preserve old routes in the target API. When implementing that API, update the route inventory and OpenAPI artifacts with the new contract.
