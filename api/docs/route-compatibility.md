# Personal route compatibility

Personal compatibility aliases remain active in API v1. They are not marked as deprecated in the OpenAPI document, and issue #100 does not remove or change them.

## Route behavior

Every route in the table is authenticated under `/api/v1/users/me`. A Personal alias resolves the authenticated User's Personal Space and delegates to the same feature service used by the corresponding explicit Space route. An explicit Space route treats `spaceId` as a lookup key and authorizes the User's membership through `SpaceAccessService`. A Personal alias never selects a Shared Space. The web adapter chooses a path before sending the request; it does not retry a failed Space request against a Personal alias.

| Financial family | Personal alias | Explicit Space route |
| --- | --- | --- |
| Categories | `GET/POST /api/v1/users/me/categories`; `GET/PATCH /api/v1/users/me/categories/{categoryId}` | `GET/POST /api/v1/users/me/spaces/{spaceId}/categories`; `GET/PATCH /api/v1/users/me/spaces/{spaceId}/categories/{categoryId}` |
| Budgets | `GET/PUT/DELETE /api/v1/users/me/categories/{categoryId}/budget` | `GET/PUT/DELETE /api/v1/users/me/spaces/{spaceId}/categories/{categoryId}/budget` |
| Category Rules | `GET/POST /api/v1/users/me/category-rules`; `GET/PATCH/DELETE /api/v1/users/me/category-rules/{ruleId}`; `PUT /api/v1/users/me/categories/{categoryId}/rules` | `GET/POST /api/v1/users/me/spaces/{spaceId}/category-rules`; `GET/PATCH/DELETE /api/v1/users/me/spaces/{spaceId}/category-rules/{ruleId}`; `PUT /api/v1/users/me/spaces/{spaceId}/categories/{categoryId}/rules` |
| Transactions | `GET/POST /api/v1/users/me/transactions`; `GET /api/v1/users/me/transactions/history`; `GET/PATCH/DELETE /api/v1/users/me/transactions/{transactionId}`; `GET /api/v1/users/me/transactions/{transactionId}/activity` | `GET/POST /api/v1/users/me/spaces/{spaceId}/transactions`; `GET /api/v1/users/me/spaces/{spaceId}/transactions/history`; `GET/PATCH/DELETE /api/v1/users/me/spaces/{spaceId}/transactions/{transactionId}`; `GET /api/v1/users/me/spaces/{spaceId}/transactions/{transactionId}/activity` |
| Statement Imports | `GET/POST /api/v1/users/me/statement-imports`; `GET /api/v1/users/me/statement-imports/{statementImportId}` | `GET/POST /api/v1/users/me/spaces/{spaceId}/statement-imports`; `GET /api/v1/users/me/spaces/{spaceId}/statement-imports/{statementImportId}` |
| Category summaries | `GET /api/v1/users/me/category-summaries` | `GET /api/v1/users/me/spaces/{spaceId}/category-summaries` |

The canonical [OpenAPI YAML](openapi.yaml) lists every operation and remains generated from API controller and DTO metadata. Matching route families preserve their operation IDs and authorization behavior.

## Capabilities without a Personal alias

These routes have no corresponding Personal financial alias:

- Space catalog and lifecycle operations such as `GET /api/v1/users/me/spaces`, `GET /api/v1/users/me/spaces/{spaceId}`, and `POST /api/v1/users/me/spaces/{spaceId}/leave`.
- Category Suggestions at `POST /api/v1/users/me/spaces/{spaceId}/statement-imports/category-suggestions`.

Invite Code and notification routes are User-scoped capabilities rather than paired financial-resource routes.

## First-party web adapter audit

The normal browser composition in [`web/src/App.tsx`](../../web/src/App.tsx) passes the selected `spaceId` and an `onSpaceChange` handler to Dashboard, Insights, Categories, Transactions, and Statement Import pages. With no URL selection, the page resolves the authenticated User's Personal Space from the accessible Space list. Queries wait for that list; once a Personal or Shared Space ID is available, normal page requests use explicit `/spaces/{spaceId}/...` routes.

Each adapter also accepts an optional Space ID. Omitting it selects a Personal alias before the HTTP request:

| Normal UI entry point | Adapter paths with an optional Space ID | Normal App call site |
| --- | --- | --- |
| Dashboard | `web/src/features/dashboard/dashboard-service.ts` selects Category and Transaction paths; `web/src/shared/api/category-summary.ts` selects the summary path. | `DashboardPage` receives the selected ID from `App.tsx`, or resolves the Personal ID. |
| Insights | `web/src/features/insights/insights-service.ts` selects Category, Budget, Transaction, and shared summary paths. | `InsightsPage` receives the selected ID from `App.tsx`, or resolves the Personal ID. |
| Categories | `web/src/features/categories/categories-service.ts` selects Category and Budget paths and uses the shared summary path; `web/src/features/categories/category-rules-service.ts` selects Category Rule list and replacement paths. | `CategoriesPage` receives the selected ID from `App.tsx`, or resolves the Personal ID. |
| Transactions and history | `web/src/features/transactions/transactions-service.ts` selects Transaction, history, activity, Category lookup, and Statement Import detail paths; `web/src/shared/account/account.ts` reads Statement Import history and details for Account projections. | `TransactionsPage` receives the selected ID from `App.tsx`; Archived Space History passes the selected Space ID. |
| Statement Import | `web/src/features/statement-import/statement-import-service.ts` selects Category, Category Rule, Statement Import history, rule-create, and commit paths. | `StatementImportPage` receives the selected ID from `App.tsx`, or resolves the Personal ID. Category Suggestions use an explicit Space ID and have no alias branch. |

The alias branch remains reachable to direct first-party callers that omit the optional ID, including isolated page or adapter invocations outside the normal `App.tsx` composition. If a normal page's accessible Space list succeeds without yielding a Personal ID, its optional adapter input can also remain undefined. These paths do not show that ordinary selected-Space page requests use aliases, and normal page requests do not show that aliases are unused. The conditionals select one route; they are not retry failover.

Repository source establishes the in-repository web call sites described above. It cannot establish the complete set of external API consumers, production request volume, or whether deployed clients and scripts still call Personal aliases. Treat those consumers as unknown until inventory or usage evidence resolves them.

## Deprecation prerequisites

The accepted lifecycle is recorded in [Personal and Shared Spaces ADR](../../docs/adr/0002-personal-and-shared-spaces.md#personal-route-compatibility-lifecycle):

1. **Complete caller migration.** Inventory first-party and known external consumers and migrate them to explicit Space IDs. Use available production usage evidence to identify callers that repository search cannot reveal.
2. **Verify authorization parity.** For every paired operation, confirm the alias resolves only to the authenticated User's Personal Space and reaches the same authorized service as the explicit route. Preserve route behavior during migration; do not introduce Shared-to-Personal fallback.
3. **Publish deprecation metadata and notice.** Only after the caller inventory and authorization checks pass, mark the Personal alias operations `deprecated: true` in the canonical OpenAPI metadata and publish a migration timeline. Continue serving the aliases throughout the stated support window.
4. **Remove in a separate reviewed change.** Remove aliases only after known callers have migrated, the support window has elapsed, and available usage evidence shows no remaining calls. If external consumers remain unknown, the removal prerequisite is not met.
