# Category Suggestions integration (legacy API capability)

This reference describes the optional server-side TypeSafe Category Suggestions capability in the current legacy API. The browser consumer has been retired. The accepted [mobile Expense contract](specifications/mobile-expense-domain-api.md) excludes remote Category Suggestions, so this endpoint is not part of the target native workflow and has no active first-party caller.

## API implementation and coverage

| Boundary | Owner / coverage |
| --- | --- |
| Authorization, selection, validation | [Application service](../api/src/statement-imports/application/statement-category-suggestions.service.ts), [Space endpoint](../api/src/statement-imports/presentation/space-statement-imports.controller.ts) |
| External request and SDK limits | [Request builder](../api/src/statement-imports/infrastructure/typesafe-category-suggestion-request.ts), [evaluator](../api/src/statement-imports/infrastructure/typesafe-category-suggestion-evaluator.ts) |
| Space-scoped history/catalog | [Catalog](../api/src/statement-imports/infrastructure/typeorm-statement-category-suggestion-catalog.ts), [PostgreSQL coverage](../api/test/statement-category-suggestions-postgres.e2e-spec.ts) |

## Flow and fallback

The endpoint requires an authenticated User with write access to the destination Space; catalog/history queries use that authorized Space. Set `TYPESAFE_API_KEY` in the API environment to enable TypeSafe. An unset key, failed calls, or invalid responses return zero suggestions. The service never assigns a Category; callers remain responsible for explicit user choice. The current mobile app does not call this endpoint.

## Data sent to TypeSafe

The request contains:

- The Transaction description, trimmed by the API.
- Active Category IDs/names and optional descriptions.
- Selected historical Transaction descriptions paired with Category IDs.

PDFs, amounts, dates, explicit User IDs, and explicit Space IDs are omitted. Descriptive text can still reveal financial activity.

The API allows at most 254 active Categories (255 choices including no-category); an empty or oversized catalog returns no suggestions. It reads at most the four most recent non-deleted Transactions per active Category, ordered by purchase date then Transaction ID. Selection retains at most 16 examples in total and one per Category, ranking shared normalized description tokens more strongly when rare.

## Validation and request limits

The TypeSafe question instructs the model to treat state text as untrusted and ignore embedded directions; this guidance does not prove prompt-injection prevention. The API accepts only current Category IDs or no-category, validates exact probability keys/distribution, applies display thresholds, and rechecks that returned Categories are active in the same Space.

TypeSafe SDK requests use a 2.5-second timeout and zero retries. No API-wide quota/concurrency limit or bound on the complete backend request, including authorization/database work, is established. Remove this legacy capability when implementing the accepted target API, which forbids remote Category Suggestions.
