# Category Suggestions integration

## Implementation entry points

| Boundary | Owner / coverage |
| --- | --- |
| Browser coordination, deduplication, cache, cancellation | [Coordinator](../web/src/features/statement-import/use-statement-category-suggestions.ts), [browser acceptance](../web/e2e/statement-import-category-suggestions.spec.ts) |
| Authorization, selection, validation | [Application service](../api/src/statement-imports/application/statement-category-suggestions.service.ts), [Space endpoint](../api/src/statement-imports/presentation/space-statement-imports.controller.ts) |
| External request and SDK limits | [Request builder](../api/src/statement-imports/infrastructure/typesafe-category-suggestion-request.ts), [evaluator](../api/src/statement-imports/infrastructure/typesafe-category-suggestion-evaluator.ts) |
| Space-scoped history/catalog | [Catalog](../api/src/statement-imports/infrastructure/typeorm-statement-category-suggestion-catalog.ts), [PostgreSQL coverage](../api/test/statement-category-suggestions-postgres.e2e-spec.ts) |

## Flow and fallback

During Categorize, the browser requests suggestions for included Unmapped Transactions. The API requires an authenticated User with write access to the destination Space; catalog/history queries use that authorized Space.

Set **TYPESAFE_API_KEY** in the API environment to enable TypeSafe. An unset key, failed calls, or invalid responses return zero suggestions; manual Category selection remains available.

## Deduplication and cache

The browser coordinator deduplicates descriptions by trimming, collapsing whitespace, and ignoring case; it sends the first description value. Results are keyed by destination Space, Category catalog, and normalized description in memory for one coordinator instance, without time-based expiry. Recreating the coordinator or changing Space/catalog can cause new requests. There is no shared or persistent API-side cache. These rules do not establish measured latency/cost savings; TypeSafe retention policies have not been verified.

## Data sent to TypeSafe

The request contains:

- The Transaction description, trimmed by the API.
- Active Category IDs/names and optional descriptions.
- Selected historical Transaction descriptions paired with Category IDs.

PDFs, amounts, dates, explicit User IDs, and explicit Space IDs are omitted. Descriptive text can still reveal financial activity.

The API allows at most 254 active Categories (255 choices including no-category); an empty or oversized catalog returns no suggestions. It reads at most the four most recent non-deleted Transactions per active Category, ordered by purchase date then Transaction ID. Selection retains at most 16 examples in total and one per Category, ranking shared normalized description tokens more strongly when rare.

## Validation and request limits

The TypeSafe question instructs the model to treat state text as untrusted and ignore embedded directions; this guidance does not prove prompt-injection prevention. The API accepts only current Category IDs or no-category, validates exact probability keys/distribution, applies display thresholds, and rechecks that returned Categories are active in the same Space. Suggestions do not assign a Category; the User chooses during Categorize.

TypeSafe SDK requests use a 2.5-second timeout and zero retries. Browser API requests use a 10-second timeout and at most three concurrent requests per coordinator. These establish neither an API-wide quota/concurrency limit nor a bound on the complete backend request, including authorization/database work.
