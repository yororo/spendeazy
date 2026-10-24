# Expense route surface

The API uses explicit authorized Space routes for financial resources. Saved spending is named Expense. Personal Spaces and Shared Spaces use the same routes; the authenticated User's membership determines access. There is no `/users/me/transactions` route family and no Personal financial alias.

Let `S` be `/api/v1/users/me/spaces/{spaceId}`.

| Resource | Current routes |
| --- | --- |
| Expenses | `GET/POST S/expenses`; `GET S/expenses/deleted`; `GET/PATCH/DELETE S/expenses/{expenseId}`; `GET S/expenses/{expenseId}/activity` |
| Categories | `GET/POST S/categories`; `GET/PATCH S/categories/{categoryId}` |
| Budgets | `GET/PUT/DELETE S/categories/{categoryId}/budget` |
| Category Rules | `GET/POST S/category-rules`; `GET/PATCH/DELETE S/category-rules/{ruleId}`; `PUT S/categories/{categoryId}/rules` |
| Category summaries | `GET S/category-summaries` |
| Statement Imports | `GET/POST S/statement-imports`; `GET S/statement-imports/{statementImportId}` |

The [generated OpenAPI YAML](openapi.yaml) and JSON artifacts are the transport source of truth. The offline OpenAPI checks assert that saved Transaction aliases and Category Suggestions are absent. Parsed statement Transactions are client-side evidence and do not define a saved API resource.

User-scoped `/api/v1/users/me`, Space catalog/lifecycle routes and Invite Code routes remain because they are not Personal financial aliases. This is a breaking development contract; no old-client compatibility period is provided. See [ADR 0004](../../docs/adr/0004-mobile-expense-domain-and-contract.md) for the decision and superseded assumptions.
